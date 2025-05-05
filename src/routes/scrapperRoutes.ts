import { getSitemapUrls, getUrlData, getUrls } from "@/controllers/scrapperControllers";
import handler from "@/utils/handler";
import { Router } from "express";

const scrapperRouter = Router();

scrapperRouter.post("/sitemap-urls", (req, res) =>
  handler(req, res, getSitemapUrls)
);

scrapperRouter.post("/urls", (req, res) => {
  handler(req, res, getUrls);
});

scrapperRouter.post("/url-data", (req, res) => {
  handler(req, res, getUrlData);
});
export default scrapperRouter;
