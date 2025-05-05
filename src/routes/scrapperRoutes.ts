import { getSitemapUrls, getUrls } from "@/controllers/scrapperControllers";
import handler from "@/utils/handler";
import { Router } from "express";

const scrapperRouter = Router();

scrapperRouter.post("/sitemap-urls", (req, res) =>
  handler(req, res, getSitemapUrls)
);

scrapperRouter.post("/urls", (req, res) => {
  handler(req, res, getUrls);
});
export default scrapperRouter;
