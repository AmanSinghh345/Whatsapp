import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type RedisClientType } from "redis";
import type { PresenceStatePayload } from "@chat/shared";
import { PrismaService } from "../prisma/prisma.service.js";

type PresenceAudience = {
  userIds: string[];
  chatIds: string[];
};

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private readonly redis?: RedisClientType;
  private readonly redisUrl: string | undefined;
  private redisReady = false;
  private readonly localPresence = new Map<string, Set<string>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.redisUrl = this.configService.get<string>("REDIS_URL");

    if (!this.redisUrl) {
      this.logger.warn(
        "Redis presence unavailable, using local fallback: REDIS_URL is not configured",
      );
      return;
    }

    this.redis = createClient({
      url: this.redisUrl,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: (retries) => {
          if (retries > 5) {
            return false;
          }

          return Math.min(retries * 200, 2000);
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.redis) {
      return;
    }

    this.redis.on("ready", () => {
      this.redisReady = true;
      this.logger.log("Redis presence connected");
    });

    this.redis.on("reconnecting", () => {
      this.redisReady = false;
      this.logger.warn("Redis presence reconnecting");
    });

    this.redis.on("end", () => {
      this.redisReady = false;
      this.logger.warn("Redis presence unavailable, using local fallback");
    });

    this.redis.on("error", (error) => {
      this.redisReady = false;
      this.logger.warn(
        `Redis presence unavailable, using local fallback: ${error.message}`,
      );
    });

    try {
      await this.redis.connect();
    } catch (error) {
      this.redisReady = false;
      this.logger.warn(
        `Redis presence unavailable, using local fallback: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis?.isOpen) {
      await this.redis.quit();
    }
  }

  async markOnline(
    userId: string,
    socketId: string,
  ): Promise<{ becameOnline: boolean; payload: PresenceStatePayload }> {
    if (!this.redisReady || !this.redis) {
      const sockets = this.localPresence.get(userId) ?? new Set<string>();
      const becameOnline = sockets.size === 0;
      sockets.add(socketId);
      this.localPresence.set(userId, sockets);

      return {
        becameOnline,
        payload: {
          userId,
          state: "online",
          updatedAt: new Date().toISOString(),
        },
      };
    }

    const key = this.socketSetKey(userId);

    try {
      const wasOnline = (await this.redis.sCard(key)) > 0;

      await this.redis.sAdd(key, socketId);
      await this.redis.sAdd("presence:online-users", userId);

      return {
        becameOnline: !wasOnline,
        payload: {
          userId,
          state: "online",
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.useLocalFallback(error);
      return this.markOnline(userId, socketId);
    }
  }

  async markOffline(
    userId: string,
    socketId: string,
  ): Promise<{ becameOffline: boolean; payload: PresenceStatePayload }> {
    if (!this.redisReady || !this.redis) {
      const sockets = this.localPresence.get(userId);
      sockets?.delete(socketId);

      if (sockets && sockets.size > 0) {
        this.localPresence.set(userId, sockets);
        return {
          becameOffline: false,
          payload: {
            userId,
            state: "online",
            updatedAt: new Date().toISOString(),
          },
        };
      }

      this.localPresence.delete(userId);

      const lastSeenAt = new Date();
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt },
      });

      return {
        becameOffline: true,
        payload: {
          userId,
          state: "offline",
          lastSeenAt: lastSeenAt.toISOString(),
          updatedAt: lastSeenAt.toISOString(),
        },
      };
    }

    const key = this.socketSetKey(userId);

    try {
      await this.redis.sRem(key, socketId);

      const remainingSockets = await this.redis.sCard(key);
      const lastSeenAt = new Date();

      if (remainingSockets > 0) {
        return {
          becameOffline: false,
          payload: {
            userId,
            state: "online",
            updatedAt: lastSeenAt.toISOString(),
          },
        };
      }

      await this.redis.del(key);
      await this.redis.sRem("presence:online-users", userId);
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt },
      });

      return {
        becameOffline: true,
        payload: {
          userId,
          state: "offline",
          lastSeenAt: lastSeenAt.toISOString(),
          updatedAt: lastSeenAt.toISOString(),
        },
      };
    } catch (error) {
      this.useLocalFallback(error);
      return this.markOffline(userId, socketId);
    }
  }

  async getPresence(userIds: string[]): Promise<PresenceStatePayload[]> {
    const uniqueUserIds = Array.from(new Set(userIds));

    if (uniqueUserIds.length === 0) {
      return [];
    }

    if (!this.redisReady || !this.redis) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: uniqueUserIds } },
        select: { id: true, lastSeenAt: true, updatedAt: true },
      });
      const usersById = new Map(users.map((user) => [user.id, user]));
      const now = new Date().toISOString();

      return uniqueUserIds.map((userId) => {
        const user = usersById.get(userId);
        const lastSeenAt = user?.lastSeenAt?.toISOString();
        const online = (this.localPresence.get(userId)?.size ?? 0) > 0;

        return {
          userId,
          state: online ? "online" : "offline",
          ...(lastSeenAt ? { lastSeenAt } : {}),
          updatedAt: online
            ? now
            : lastSeenAt ?? user?.updatedAt.toISOString() ?? now,
        };
      });
    }

    try {
      const redis = this.redis;
      const [onlineFlags, users] = await Promise.all([
        Promise.all(
          uniqueUserIds.map(async (userId) => ({
            userId,
            online: (await redis.sCard(this.socketSetKey(userId))) > 0,
          })),
        ),
        this.prisma.user.findMany({
          where: { id: { in: uniqueUserIds } },
          select: { id: true, lastSeenAt: true, updatedAt: true },
        }),
      ]);

      const usersById = new Map(users.map((user) => [user.id, user]));
      const now = new Date().toISOString();

      return onlineFlags.map(({ userId, online }) => {
        const user = usersById.get(userId);
        const lastSeenAt = user?.lastSeenAt?.toISOString();

        return {
          userId,
          state: online ? "online" : "offline",
          ...(lastSeenAt ? { lastSeenAt } : {}),
          updatedAt: online
            ? now
            : lastSeenAt ?? user?.updatedAt.toISOString() ?? now,
        };
      });
    } catch (error) {
      this.useLocalFallback(error);
      return this.getPresence(userIds);
    }
  }

  async getAudienceForUser(userId: string): Promise<PresenceAudience> {
    const memberships = await this.prisma.chatMember.findMany({
      where: { userId },
      select: {
        chatId: true,
        chat: {
          select: {
            members: {
              select: { userId: true },
            },
          },
        },
      },
    });

    const userIds = new Set<string>();
    const chatIds = new Set<string>();

    for (const membership of memberships) {
      chatIds.add(membership.chatId);

      for (const member of membership.chat.members) {
        if (member.userId !== userId) {
          userIds.add(member.userId);
        }
      }
    }

    return {
      userIds: Array.from(userIds),
      chatIds: Array.from(chatIds),
    };
  }

  private socketSetKey(userId: string): string {
    return `presence:user:${userId}:sockets`;
  }

  private useLocalFallback(error: unknown): void {
    this.redisReady = false;
    this.logger.warn(
      `Redis presence unavailable, using local fallback: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}
