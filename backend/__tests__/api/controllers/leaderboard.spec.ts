import _ from "lodash";
import { ObjectId } from "mongodb";
import request from "supertest";
import app from "../../../src/app";
import * as LeaderboardDal from "../../../src/dal/leaderboards";
import * as DailyLeaderboards from "../../../src/utils/daily-leaderboards";
import * as WeeklyXpLeaderboard from "../../../src/services/weekly-xp-leaderboard";
import * as Configuration from "../../../src/init/configuration";
import {
  mockAuthenticateWithApeKey,
  mockBearerAuthentication,
} from "../../__testData__/auth";
import { XpLeaderboardEntry } from "@monkeytype/schemas/leaderboards";

const mockApp = request(app);
const configuration = Configuration.getCachedConfiguration();
const uid = new ObjectId().toHexString();
const mockAuth = mockBearerAuthentication(uid);

const allModes = [
  "10",
  "25",
  "50",
  "100",
  "15",
  "30",
  "60",
  "120",
  "zen",
  "custom",
];

describe("Loaderboard Controller", () => {
  beforeEach(() => {
    mockAuth.beforeEach();
  });
  describe("get leaderboard", () => {
    const getLeaderboardMock = vi.spyOn(LeaderboardDal, "get");
    const getLeaderboardCountMock = vi.spyOn(LeaderboardDal, "getCount");

    beforeEach(() => {
      getLeaderboardMock.mockReset();
      getLeaderboardCountMock.mockReset();
    });

    it("should get for english time 60", async () => {
      //GIVEN

      const resultData = {
        count: 42,
        pageSize: 50,
        entries: [
          {
            wpm: 20,
            acc: 90,
            timestamp: 1000,
            raw: 92,
            consistency: 80,
            uid: "user1",
            name: "user1",
            discordId: "discordId",
            discordAvatar: "discordAvatar",
            rank: 1,
            badgeId: 1,
            isPremium: true,
          },
          {
            wpm: 10,
            acc: 80,
            timestamp: 1200,
            raw: 82,
            uid: "user2",
            name: "user2",
            rank: 2,
          },
        ],
      };
      const mockData = resultData.entries.map((it) => ({
        ...it,
        _id: new ObjectId(),
      }));
      getLeaderboardMock.mockResolvedValue(mockData);
      getLeaderboardCountMock.mockResolvedValue(42);

      //WHEN

      const { body } = await mockApp
        .get("/leaderboards")
        .query({ language: "english", mode: "time", mode2: "60" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Leaderboard retrieved",
        data: resultData,
      });

      expect(getLeaderboardMock).toHaveBeenCalledWith(
        "time",
        "60",
        "english",
        0,
        50
      );
    });

    it("should get for english time 60 with page", async () => {
      //GIVEN
      getLeaderboardMock.mockResolvedValue([]);
      getLeaderboardCountMock.mockResolvedValue(0);
      const page = 0;
      const pageSize = 25;

      //WHEN

      const { body } = await mockApp
        .get("/leaderboards")
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
          page,
          pageSize,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Leaderboard retrieved",
        data: {
          count: 0,
          pageSize: 25,
          entries: [],
        },
      });

      expect(getLeaderboardMock).toHaveBeenCalledWith(
        "time",
        "60",
        "english",
        page,
        pageSize
      );
    });

    describe("should get for modes", async () => {
      beforeEach(() => {
        getLeaderboardMock.mockResolvedValue([]);
      });

      const testCases = [
        { mode: "time", mode2: "15", language: "english", expectStatus: 200 },
        { mode: "time", mode2: "60", language: "english", expectStatus: 200 },
        { mode: "time", mode2: "30", language: "english", expectStatus: 404 },
        { mode: "words", mode2: "15", language: "english", expectStatus: 404 },
        { mode: "time", mode2: "15", language: "spanish", expectStatus: 404 },
      ];
      it.for(testCases)(
        `expect $expectStatus for mode $mode, mode2 $mode2, lang $language`,
        async ({ mode, mode2, language, expectStatus }) => {
          await mockApp
            .get("/leaderboards")
            .query({ language, mode, mode2 })
            .expect(expectStatus);
        }
      );
    });

    it("fails for missing query", async () => {
      const { body } = await mockApp.get("/leaderboards").expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          '"language" Required',
          '"mode" Required',
          '"mode2" Needs to be either a number, "zen" or "custom".',
        ],
      });
    });
    it("fails for invalid query", async () => {
      const { body } = await mockApp
        .get("/leaderboards")
        .query({
          language: "en?gli.sh",
          mode: "unknownMode",
          mode2: "unknownMode2",
          page: -1,
          pageSize: 500,
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          '"language" Invalid enum value. Must be a supported language',
          `"mode" Invalid enum value. Expected 'time' | 'words' | 'quote' | 'custom' | 'zen', received 'unknownMode'`,
          '"mode2" Needs to be a number or a number represented as a string e.g. "10".',
          '"page" Number must be greater than or equal to 0',
          '"pageSize" Number must be less than or equal to 200',
        ],
      });
    });
    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards")
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
          extra: "value",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("fails while leaderboard is updating", async () => {
      //GIVEN
      getLeaderboardMock.mockResolvedValue(false);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards")
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
        })
        .expect(503);

      expect(body.message).toEqual(
        "Leaderboard is currently updating. Please try again in a few seconds."
      );
    });
  });

  describe("get rank", () => {
    const getLeaderboardRankMock = vi.spyOn(LeaderboardDal, "getRank");

    afterEach(() => {
      getLeaderboardRankMock.mockReset();
    });

    it("fails withouth authentication", async () => {
      await mockApp
        .get("/leaderboards/rank")
        .query({ language: "english", mode: "time", mode2: "60" })
        .expect(401);
    });

    it("should get for english time 60", async () => {
      //GIVEN

      const entryId = new ObjectId();
      const resultEntry = {
        _id: entryId.toHexString(),
        wpm: 10,
        acc: 80,
        timestamp: 1200,
        raw: 82,
        uid: "user2",
        name: "user2",
        rank: 2,
      };
      getLeaderboardRankMock.mockResolvedValue(resultEntry);

      //WHEN

      const { body } = await mockApp
        .get("/leaderboards/rank")
        .query({ language: "english", mode: "time", mode2: "60" })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Rank retrieved",
        data: resultEntry,
      });

      expect(getLeaderboardRankMock).toHaveBeenCalledWith(
        "time",
        "60",
        "english",
        uid
      );
    });
    it("should get with ape key", async () => {
      await acceptApeKeys(true);
      const apeKey = await mockAuthenticateWithApeKey(uid, await configuration);

      await mockApp
        .get("/leaderboards/rank")
        .query({ language: "english", mode: "time", mode2: "60" })
        .set("authorization", "ApeKey " + apeKey)
        .expect(200);
    });
    it("should get for mode", async () => {
      getLeaderboardRankMock.mockResolvedValue({} as any);
      for (const mode of ["time", "words", "quote", "zen", "custom"]) {
        const response = await mockApp
          .get("/leaderboards/rank")
          .set("Authorization", `Bearer ${uid}`)
          .query({ language: "english", mode, mode2: "custom" });
        expect(response.status, "for mode " + mode).toEqual(200);
      }
    });

    it("should get for mode2", async () => {
      getLeaderboardRankMock.mockResolvedValue({} as any);
      for (const mode2 of allModes) {
        const response = await mockApp
          .get("/leaderboards/rank")
          .set("Authorization", `Bearer ${uid}`)
          .query({ language: "english", mode: "words", mode2 });

        expect(response.status, "for mode2 " + mode2).toEqual(200);
      }
    });
    it("fails for missing query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          '"language" Required',
          '"mode" Required',
          '"mode2" Needs to be either a number, "zen" or "custom".',
        ],
      });
    });
    it("fails for invalid query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/rank")
        .query({
          language: "en?gli.sh",
          mode: "unknownMode",
          mode2: "unknownMode2",
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          '"language" Invalid enum value. Must be a supported language',
          `"mode" Invalid enum value. Expected 'time' | 'words' | 'quote' | 'custom' | 'zen', received 'unknownMode'`,
          '"mode2" Needs to be a number or a number represented as a string e.g. "10".',
        ],
      });
    });
    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/rank")
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
          extra: "value",
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("fails while leaderboard is updating", async () => {
      //GIVEN
      getLeaderboardRankMock.mockResolvedValue(false);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/rank")
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(503);

      expect(body.message).toEqual(
        "Leaderboard is currently updating. Please try again in a few seconds."
      );
    });
  });

  describe("get daily leaderboard", () => {
    const getDailyLeaderboardMock = vi.spyOn(
      DailyLeaderboards,
      "getDailyLeaderboard"
    );

    beforeEach(async () => {
      getDailyLeaderboardMock.mockReset();
      vi.useFakeTimers();
      vi.setSystemTime(1722606812000);
      await dailyLeaderboardEnabled(true);

      getDailyLeaderboardMock.mockReturnValue({
        getResults: () => Promise.resolve([]),
        getCount: () => Promise.resolve(0),
        getMinWpm: () => Promise.resolve(0),
      } as any);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should get for english time 60", async () => {
      //GIVEN
      const lbConf = (await configuration).dailyLeaderboards;
      const premiumEnabled = (await configuration).users.premium.enabled;

      const resultData = {
        minWpm: 10,
        entries: [
          {
            name: "user1",
            rank: 1,
            wpm: 20,
            acc: 90,
            timestamp: 1000,
            raw: 92,
            consistency: 80,
            uid: "user1",
            discordId: "discordId",
            discordAvatar: "discordAvatar",
          },
          {
            wpm: 10,
            rank: 2,
            acc: 80,
            timestamp: 1200,
            raw: 82,
            consistency: 72,
            uid: "user2",
            name: "user2",
          },
        ],
      };

      const getResultMock = vi.fn();
      getResultMock.mockResolvedValue(resultData);

      const getCountMock = vi.fn();
      getCountMock.mockResolvedValue(2);

      const getMinWpmMock = vi.fn();
      getMinWpmMock.mockResolvedValue(10);

      getDailyLeaderboardMock.mockReturnValue({
        getResults: getResultMock,
        getCount: getCountMock,
        getMinWpm: getMinWpmMock,
      } as any);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({ language: "english", mode: "time", mode2: "60" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Daily leaderboard retrieved",
        data: {
          count: 2,
          pageSize: 50,
          minWpm: 10,
          entries: resultData,
        },
      });

      expect(getDailyLeaderboardMock).toHaveBeenCalledWith(
        "english",
        "time",
        "60",
        lbConf,
        -1
      );

      expect(getResultMock).toHaveBeenCalledWith(0, 50, lbConf, premiumEnabled);
    });

    it("should get for english time 60 for yesterday", async () => {
      //GIVEN
      const lbConf = (await configuration).dailyLeaderboards;

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
          daysBefore: 1,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Daily leaderboard retrieved",
        data: {
          entries: [],
          count: 0,
          pageSize: 50,
          minWpm: 0,
        },
      });

      expect(getDailyLeaderboardMock).toHaveBeenCalledWith(
        "english",
        "time",
        "60",
        lbConf,
        1722470400000
      );
    });
    it("should get for english time 60 with page and pageSize", async () => {
      //GIVEN
      const lbConf = (await configuration).dailyLeaderboards;
      const premiumEnabled = (await configuration).users.premium.enabled;
      const page = 2;
      const pageSize = 25;

      const getResultMock = vi.fn();
      getResultMock.mockResolvedValue([]);

      const getCountMock = vi.fn();
      getCountMock.mockResolvedValue(0);

      const getMinWpmMock = vi.fn();
      getMinWpmMock.mockResolvedValue(0);

      getDailyLeaderboardMock.mockReturnValue({
        getResults: getResultMock,
        getCount: getCountMock,
        getMinWpm: getMinWpmMock,
      } as any);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
          page,
          pageSize,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Daily leaderboard retrieved",
        data: {
          entries: [],
          count: 0,
          pageSize,
          minWpm: 0,
        },
      });

      expect(getDailyLeaderboardMock).toHaveBeenCalledWith(
        "english",
        "time",
        "60",
        lbConf,
        -1
      );

      expect(getResultMock).toHaveBeenCalledWith(
        page,
        pageSize,
        lbConf,
        premiumEnabled
      );
    });

    it("fails for daysBefore not one", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
          daysBefore: 2,
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"daysBefore" Invalid literal value, expected 1'],
      });
    });

    it("fails if daily leaderboards are disabled", async () => {
      await dailyLeaderboardEnabled(false);

      const { body } = await mockApp.get("/leaderboards/daily").expect(503);

      expect(body.message).toEqual(
        "Daily leaderboards are not available at this time."
      );
    });

    it("should get for mode", async () => {
      for (const mode of ["time", "words", "quote", "zen", "custom"]) {
        const response = await mockApp
          .get("/leaderboards/daily")
          .query({ language: "english", mode, mode2: "custom" });
        expect(response.status, "for mode " + mode).toEqual(200);
      }
    });

    it("should get for mode2", async () => {
      for (const mode2 of allModes) {
        const response = await mockApp
          .get("/leaderboards/daily")
          .query({ language: "english", mode: "words", mode2 });

        expect(response.status, "for mode2 " + mode2).toEqual(200);
      }
    });
    it("fails for missing query", async () => {
      const { body } = await mockApp.get("/leaderboards").expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          '"language" Required',
          '"mode" Required',
          '"mode2" Needs to be either a number, "zen" or "custom".',
        ],
      });
    });
    it("fails for invalid query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          language: "en?gli.sh",
          mode: "unknownMode",
          mode2: "unknownMode2",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          '"language" Invalid enum value. Must be a supported language',
          `"mode" Invalid enum value. Expected 'time' | 'words' | 'quote' | 'custom' | 'zen', received 'unknownMode'`,
          '"mode2" Needs to be a number or a number represented as a string e.g. "10".',
        ],
      });
    });
    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
          extra: "value",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("fails while leaderboard is missing", async () => {
      //GIVEN
      getDailyLeaderboardMock.mockReturnValue(null);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
        })
        .expect(404);

      expect(body.message).toEqual(
        "There is no daily leaderboard for this mode"
      );
    });
  });

  describe("get daily leaderboard rank", () => {
    const getDailyLeaderboardMock = vi.spyOn(
      DailyLeaderboards,
      "getDailyLeaderboard"
    );

    beforeEach(async () => {
      getDailyLeaderboardMock.mockReset();
      vi.useFakeTimers();
      vi.setSystemTime(1722606812000);
      await dailyLeaderboardEnabled(true);

      getDailyLeaderboardMock.mockReturnValue({
        getRank: () => Promise.resolve({} as any),
      } as any);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("fails withouth authentication", async () => {
      await mockApp
        .get("/leaderboards/daily/rank")

        .query({ language: "english", mode: "time", mode2: "60" })
        .expect(401);
    });
    it("should get for english time 60", async () => {
      //GIVEN
      const lbConf = (await configuration).dailyLeaderboards;
      const rankData = {
        min: 100,
        count: 1000,
        rank: 12,
        entry: {
          wpm: 10,
          rank: 2,
          acc: 80,
          timestamp: 1200,
          raw: 82,
          consistency: 72,
          uid: "user2",
          name: "user2",
        },
      };

      const getRankMock = vi.fn();
      getRankMock.mockResolvedValue(rankData);
      getDailyLeaderboardMock.mockReturnValue({
        getRank: getRankMock,
      } as any);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .set("Authorization", `Bearer ${uid}`)
        .query({ language: "english", mode: "time", mode2: "60" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Daily leaderboard rank retrieved",
        data: rankData,
      });

      expect(getDailyLeaderboardMock).toHaveBeenCalledWith(
        "english",
        "time",
        "60",
        lbConf,
        -1
      );

      expect(getRankMock).toHaveBeenCalledWith(uid, lbConf);
    });
    it("fails if daily leaderboards are disabled", async () => {
      await dailyLeaderboardEnabled(false);

      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(503);

      expect(body.message).toEqual(
        "Daily leaderboards are not available at this time."
      );
    });
    it("should get for mode", async () => {
      for (const mode of ["time", "words", "quote", "zen", "custom"]) {
        const response = await mockApp
          .get("/leaderboards/daily/rank")
          .set("Authorization", `Bearer ${uid}`)
          .query({ language: "english", mode, mode2: "custom" });
        expect(response.status, "for mode " + mode).toEqual(200);
      }
    });
    it("should get for mode2", async () => {
      for (const mode2 of allModes) {
        const response = await mockApp
          .get("/leaderboards/daily/rank")
          .set("Authorization", `Bearer ${uid}`)
          .query({ language: "english", mode: "words", mode2 });

        expect(response.status, "for mode2 " + mode2).toEqual(200);
      }
    });
    it("fails for missing query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          '"language" Required',
          '"mode" Required',
          '"mode2" Needs to be either a number, "zen" or "custom".',
        ],
      });
    });
    it("fails for invalid query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .query({
          language: "en?gli.sh",
          mode: "unknownMode",
          mode2: "unknownMode2",
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          '"language" Invalid enum value. Must be a supported language',
          `"mode" Invalid enum value. Expected 'time' | 'words' | 'quote' | 'custom' | 'zen', received 'unknownMode'`,
          '"mode2" Needs to be a number or a number represented as a string e.g. "10".',
        ],
      });
    });
    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
          extra: "value",
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("fails while leaderboard is missing", async () => {
      //GIVEN
      getDailyLeaderboardMock.mockReturnValue(null);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .set("Authorization", `Bearer ${uid}`)
        .query({
          language: "english",
          mode: "time",
          mode2: "60",
        })
        .expect(404);

      expect(body.message).toEqual(
        "There is no daily leaderboard for this mode"
      );
    });
  });

  describe("get xp weekly leaderboard", () => {
    const getXpWeeklyLeaderboardMock = vi.spyOn(WeeklyXpLeaderboard, "get");

    beforeEach(async () => {
      getXpWeeklyLeaderboardMock.mockReset();
      vi.useFakeTimers();
      vi.setSystemTime(1722606812000);
      await weeklyLeaderboardEnabled(true);

      getXpWeeklyLeaderboardMock.mockReturnValue({
        getResults: () => Promise.resolve([]),
        getCount: () => Promise.resolve(0),
      } as any);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should get", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;

      const resultData: XpLeaderboardEntry[] = [
        {
          totalXp: 100,
          rank: 1,
          timeTypedSeconds: 100,
          uid: "user1",
          name: "user1",
          discordId: "discordId",
          discordAvatar: "discordAvatar",
          lastActivityTimestamp: 1000,
        },
        {
          totalXp: 75,
          rank: 2,
          timeTypedSeconds: 200,
          uid: "user2",
          name: "user2",
          discordId: "discordId2",
          discordAvatar: "discordAvatar2",
          lastActivityTimestamp: 2000,
        },
      ];

      const getResultMock = vi.fn();
      getResultMock.mockResolvedValue(resultData);

      const getCountMock = vi.fn();
      getCountMock.mockResolvedValue(2);

      getXpWeeklyLeaderboardMock.mockReturnValue({
        getResults: getResultMock,
        getCount: getCountMock,
      } as any);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly")
        .query({})
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Weekly xp leaderboard retrieved",
        data: {
          entries: resultData,
          count: 2,
          pageSize: 50,
        },
      });

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(lbConf, -1);

      expect(getResultMock).toHaveBeenCalledWith(0, 50, lbConf, false);
    });

    it("should get for last week", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly")
        .query({
          weeksBefore: 1,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Weekly xp leaderboard retrieved",
        data: {
          count: 0,
          entries: [],
          pageSize: 50,
        },
      });

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(
        lbConf,
        1721606400000
      );
    });

    it("should get with skip and limit", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;
      const page = 2;
      const pageSize = 25;

      const getResultMock = vi.fn();
      getResultMock.mockResolvedValue([]);

      const getCountMock = vi.fn();
      getCountMock.mockResolvedValue(0);

      getXpWeeklyLeaderboardMock.mockReturnValue({
        getResults: getResultMock,
        getCount: getCountMock,
      } as any);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly")
        .query({
          page,
          pageSize,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Weekly xp leaderboard retrieved",
        data: {
          entries: [],
          count: 0,
          pageSize,
        },
      });

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(lbConf, -1);

      expect(getResultMock).toHaveBeenCalledWith(page, pageSize, lbConf, false);
    });

    it("fails if daily leaderboards are disabled", async () => {
      await weeklyLeaderboardEnabled(false);

      const { body } = await mockApp.get("/leaderboards/xp/weekly").expect(503);

      expect(body.message).toEqual(
        "Weekly XP leaderboards are not available at this time."
      );
    });

    it("fails for weeksBefore not one", async () => {
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly")
        .query({
          weeksBefore: 2,
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"weeksBefore" Invalid literal value, expected 1'],
      });
    });
    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly")
        .query({
          extra: "value",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("fails while leaderboard is missing", async () => {
      //GIVEN
      getXpWeeklyLeaderboardMock.mockReturnValue(null);

      //WHEN
      const { body } = await mockApp.get("/leaderboards/xp/weekly").expect(404);

      expect(body.message).toEqual("XP leaderboard for this week not found.");
    });
  });

  describe("get xp weekly leaderboard rank", () => {
    const getXpWeeklyLeaderboardMock = vi.spyOn(WeeklyXpLeaderboard, "get");

    beforeEach(async () => {
      getXpWeeklyLeaderboardMock.mockReset();
      await weeklyLeaderboardEnabled(true);
      vi.useFakeTimers();
      vi.setSystemTime(1722606812000);
    });

    it("fails withouth authentication", async () => {
      await mockApp.get("/leaderboards/xp/weekly/rank").expect(401);
    });

    it("should get", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;

      const resultData: XpLeaderboardEntry = {
        totalXp: 100,
        rank: 1,
        timeTypedSeconds: 100,
        uid: "user1",
        name: "user1",
        discordId: "discordId",
        discordAvatar: "discordAvatar",
        lastActivityTimestamp: 1000,
      };
      const getRankMock = vi.fn();
      getRankMock.mockResolvedValue(resultData);
      getXpWeeklyLeaderboardMock.mockReturnValue({
        getRank: getRankMock,
      } as any);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Weekly xp leaderboard rank retrieved",
        data: resultData,
      });

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(lbConf, -1);

      expect(getRankMock).toHaveBeenCalledWith(uid, lbConf);
    });

    it("should get for last week", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;

      const resultData: XpLeaderboardEntry = {
        totalXp: 100,
        rank: 1,
        timeTypedSeconds: 100,
        uid: "user1",
        name: "user1",
        discordId: "discordId",
        discordAvatar: "discordAvatar",
        lastActivityTimestamp: 1000,
      };
      const getRankMock = vi.fn();
      getRankMock.mockResolvedValue(resultData);
      getXpWeeklyLeaderboardMock.mockReturnValue({
        getRank: getRankMock,
      } as any);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .query({ weeksBefore: 1 })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Weekly xp leaderboard rank retrieved",
        data: resultData,
      });

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(
        lbConf,
        1721606400000
      );

      expect(getRankMock).toHaveBeenCalledWith(uid, lbConf);
    });
    it("fails if daily leaderboards are disabled", async () => {
      await weeklyLeaderboardEnabled(false);

      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(503);

      expect(body.message).toEqual(
        "Weekly XP leaderboards are not available at this time."
      );
    });

    it("fails for weeksBefore not one", async () => {
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .set("Authorization", `Bearer ${uid}`)
        .query({
          weeksBefore: 2,
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"weeksBefore" Invalid literal value, expected 1'],
      });
    });

    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .set("Authorization", `Bearer ${uid}`)
        .query({
          extra: "value",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });

    it("fails while leaderboard is missing", async () => {
      //GIVEN
      getXpWeeklyLeaderboardMock.mockReturnValue(null);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(404);

      expect(body.message).toEqual("XP leaderboard for this week not found.");
    });
  });
});

async function acceptApeKeys(enabled: boolean): Promise<void> {
  const mockConfig = _.merge(await configuration, {
    apeKeys: { acceptKeys: enabled },
  });

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig
  );
}

async function dailyLeaderboardEnabled(enabled: boolean): Promise<void> {
  const mockConfig = _.merge(await configuration, {
    dailyLeaderboards: { enabled: enabled },
  });

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig
  );
}
async function weeklyLeaderboardEnabled(enabled: boolean): Promise<void> {
  const mockConfig = _.merge(await configuration, {
    leaderboards: { weeklyXp: { enabled } },
  });

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig
  );
}
