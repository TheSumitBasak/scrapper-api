import { NextFunction, Request, Response } from "express";

export default function handler(req: Request, res: Response, fn: Function) {
  try {
    fn(req, res);
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
}
