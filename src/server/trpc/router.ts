import { router, createCallerFactory } from './init';
import { authRouter } from './routers/auth';
import { userRouter } from './routers/user';
import { exerciseRouter } from './routers/exercise';
import { workoutRouter } from './routers/workout';
import { notificationRouter } from './routers/notification';
import { trainerRouter } from './routers/trainer';
import { profileRouter } from './routers/profile';
import { habitRouter } from './routers/habit';
import { challengeRouter } from './routers/challenge';
import { auditLogRouter } from './routers/auditLog';
import { announcementRouter } from './routers/announcement';
import { achievementRouter } from './routers/achievement';
import { messageRouter } from './routers/message';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  exercise: exerciseRouter,
  workout: workoutRouter,
  notification: notificationRouter,
  trainer: trainerRouter,
  profile: profileRouter,
  habit: habitRouter,
  challenge: challengeRouter,
  auditLog: auditLogRouter,
  announcement: announcementRouter,
  achievement: achievementRouter,
  message: messageRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
