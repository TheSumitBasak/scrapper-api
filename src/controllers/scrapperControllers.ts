import xml2js from "xml2js";
import axios from "axios";
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { crawlWebsite, getUrlsData } from "@/utils/crawler";
import NodeCache from "node-cache";
import { CrawlerSessionState } from "@/types/crawlerSession";

const sessionCache = new NodeCache({ stdTTL: 3600 }); // 1 hour TTL

export async function getSitemapUrls(req: Request, res: Response) {
  const { sitemapUrl } = req.body;

  if (!sitemapUrl) {
    res.status(400).json({ error: "Missing sitemap URL" });
    return;
  }

  // Fetch the sitemap XML
  const { data: xmlData } = await axios.get(sitemapUrl);

  // Parse the XML
  xml2js.parseString(xmlData, (err, result) => {
    if (err) {
      res.status(500).json({ error: "Error parsing XML" });
      return;
    }

    // Extract URLs (assuming it's a simple sitemap with <urlset>)
    const urls = result.urlset.url.map((entry: any) => entry.loc[0]);
    res.json({ urls });
    return;
  });
}

export async function getUrls(req: Request, res: Response) {
  const { url, token } = req.body;

  if (!url && !token) {
    res.status(400).json({ error: "Missing URL" });
    return;
  }

  let session: CrawlerSessionState;

  if (token) {
    session = sessionCache.get(token) as CrawlerSessionState;
    if (!session) {
      return res.status(404).send("Session not found for the given token.");
    }
    console.log(`🔄 Resuming session: ${token}`);
  } else {
    // New session
    const newToken = uuidv4();
    session = {
      token: newToken,
      queue: [url],
      visited: new Set(),
      allLinks: new Set(),
    };
    sessionCache.set(newToken, session);
    console.log(`🆕 Starting new session: ${newToken}`);
  }

  try {
    const result = await crawlWebsite(session, url || session.queue[0]);
    res.json(result);
  } catch (err) {
    const error = err as Error;
    res.status(500).send("Error during crawling: " + error.message);
  }
}

export async function getUrlData(req: Request, res: Response) {
  const { urls } = req.body;

  if (!urls?.length) {
    res.status(400).json({ error: "Missing URL" });
    return;
  }
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  await getUrlsData(req, res, urls);
}
