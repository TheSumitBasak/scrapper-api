// Intitialize ENV
import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import scrapperRouter from "@/routes/scrapperRoutes";

const app = express();

app.use(express.json({ limit: "10mb" })); // or bigger if needed
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Import routes
app.use("/api/scrapper", scrapperRouter);

app.use(
  cors({
    origin: ["http://localhost:5173"],
    methods: ["GET"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});
