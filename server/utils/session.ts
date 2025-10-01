import type { SessionRequest } from "../routes/types";

export async function regenerateSession(req: SessionRequest): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export async function saveSession(req: SessionRequest): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.save(err => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
