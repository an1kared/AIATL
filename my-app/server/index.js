/* eslint-env node */
/* global process */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ObjectId } from "mongodb";
import { fileURLToPath } from "url";
import path from "path";
import fetch from "node-fetch";
import { GoogleAuth } from "google-auth-library";
import { getCollection, closeDatabase } from "./databaseClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
const { PORT = 4000 } = process.env;

const app = express();
app.use(cors());
app.use(express.json());

// === Google Cloud Auth ===
async function getAccessToken() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Unable to obtain Google Cloud access token");
  return token;
}

function buildOperationUrl(operationName, location) {
  if (!operationName) throw new Error("Missing operation name");

  if (operationName.startsWith("projects/") && operationName.includes("/publishers/")) {
    const [prefix, operationId] = operationName.split("/operations/");
    const normalizedPrefix = prefix.split("/publishers/")[0];
    return `https://${location}-aiplatform.googleapis.com/v1/${normalizedPrefix}/operations/${operationId}`;
  }

  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error("Missing GCP_PROJECT_ID environment variable");
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/operations/${operationName}`;
}

// === Poll until Veo video is ready ===
async function pollOperation(operationName, accessToken, location) {
  const endpoint = buildOperationUrl(operationName, location);

  while (true) {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Polling failed: ${response.status} ${body}`);
    }

    const data = await response.json();
    if (data.done) {
      if (data.error) throw new Error(`Veo operation failed: ${data.error.message}`);
      return data.response || {};
    }

    // Poll every 5 seconds
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// === Generate short Veo video clips ===
async function generateRecipeVideos(steps = []) {
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_LOCATION || "us-central1";
  if (!projectId) throw new Error("Missing GCP_PROJECT_ID");

  const accessToken = await getAccessToken();

  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/veo-3.1-generate-preview:predictLongRunning`;

  const videos = [];

  for (const step of steps) {
    const prompt = `Cinematic 4K cooking scene: ${step}. Soft lighting, realistic textures, food close-ups.`;

    let startResponse;
    for (let attempt = 0; attempt < 3; attempt++) {
      startResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            aspectRatio: "16:9",
            sampleCount: 1,
            durationSeconds: 6,
            generateAudio: false,
            addWatermark: true,
            resolution: "720p",
          },
        }),
      });

      if (startResponse.status === 429) {
        console.warn("⚠️ Quota hit, waiting 30s before retry...");
        await new Promise((r) => setTimeout(r, 30000));
        continue;
      }

      break;
    }

    if (!startResponse.ok) {
      const body = await startResponse.text().catch(() => "");
      throw new Error(`Veo start request failed: ${startResponse.status} ${body}`);
    }

    const data = await startResponse.json();
    console.log("🎬 Veo operation started:", data.name);

    // Poll until video is ready
    const result = await pollOperation(data.name, accessToken, location);
    const predictions = result.predictions || result.output || [];

    let videoUrl;
    for (const pred of predictions) {
      if (pred.outputUri) videoUrl = pred.outputUri;
      if (pred.mediaOutputs) {
        const vid = pred.mediaOutputs.find((m) => m.format === "VIDEO" && (m.uri || m.gcsUri));
        if (vid) videoUrl = vid.uri || vid.gcsUri;
      }
    }

    if (!videoUrl) throw new Error("No video URL in Veo result");
    videos.push({ step, url: videoUrl });
  }

  return videos;
}

async function generateRecipeImage({ title, summary, ingredients }) {
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_LOCATION || "us-central1";
  if (!projectId) throw new Error("Missing GCP_PROJECT_ID");

  const accessToken = await getAccessToken();
  const normalizedIngredients = Array.isArray(ingredients)
    ? ingredients
        .map((entry) =>
          String(entry || "")
            .replace(/^[^\w]+/, "")
            .trim(),
        )
        .filter(Boolean)
    : [];

  const prompt = [
    "Create a single appetizing hero food photograph suitable for a smart kitchen recipe app.",
    `Recipe title: ${title || "Delicious Dish"}.`,
    normalizedIngredients.length ? `Key ingredients to feature: ${normalizedIngredients.join(", ")}.` : "",
    summary ? `Flavor inspiration: ${summary}.` : "",
    "Portray only the finished plated dish ready to serve — no cooking process, utensils in motion, or prep scenes.",
    "Use bright, natural lighting, shallow depth of field, clean background, and no text overlays or watermarks.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const modelId = process.env.IMAGEN_MODEL_ID || "imagen-4.0-generate-001";
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predict`;

  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [
          {
            prompt,
          },
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1",
          negativePrompt: "low quality, distorted, blurry, text, watermark",
          enhancePrompt: false,
          personGeneration: "allow_all",
          safetySetting: "block_few",
          addWatermark: true,
          includeRaiReason: true,
          language: "auto",
        },
      }),
    });

    if ([403, 429, 503].includes(response.status)) {
      console.warn("⚠️ Imagen quota/availability issue, retrying in 30s...");
      await new Promise((r) => setTimeout(r, 30000));
      continue;
    }
    break;
  }

  if (!response?.ok) {
    const body = await response?.text?.().catch(() => "");
    throw new Error(`Imagen request failed: ${response?.status} ${body}`);
  }

  const data = await response.json();
  const predictions = Array.isArray(data?.predictions) ? data.predictions : [];
  if (!predictions.length) {
    throw new Error("Imagen returned no predictions");
  }

  for (const prediction of predictions) {
    const imageEntries = Array.isArray(prediction?.images) ? prediction.images : [];
    for (const entry of imageEntries) {
      if (entry?.bytesBase64Encoded) {
        return `data:image/png;base64,${entry.bytesBase64Encoded}`;
      }
      if (entry?.uri) {
        return entry.uri;
      }
    }

    const mediaOutputs = prediction?.mediaOutputs || [];
    for (const entry of mediaOutputs) {
      if (entry?.format === "IMAGE") {
        if (entry?.bytesBase64Encoded) {
          return `data:image/png;base64,${entry.bytesBase64Encoded}`;
        }
        if (entry?.uri) {
          return entry.uri;
        }
      }
    }

    if (prediction?.bytesBase64Encoded) {
      return `data:image/png;base64,${prediction.bytesBase64Encoded}`;
    }
  }

  throw new Error("No usable image payload returned by Imagen");
}

// === ROUTES ===
app.get("/api/detections", async (req, res) => {
  try {
    const collection = await getCollection();
    const detections = await collection.find().sort({ captured_date: -1 }).toArray();
    res.json({ detections });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch detections" });
  }
});

app.post("/api/detections", async (req, res) => {
  try {
    const { captured_date, groceries } = req.body;
    if (!captured_date || !Array.isArray(groceries))
      return res.status(400).json({ error: "captured_date + groceries required" });

    const doc = {
      captured_date: new Date(captured_date).toISOString(),
      groceries,
      created_at: new Date().toISOString(),
    };

    const collection = await getCollection();
    const result = await collection.insertOne(doc);
    res.status(201).json({ detection: { ...doc, _id: result.insertedId } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save detection" });
  }
});

app.delete("/api/detections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const collection = await getCollection();
    const det = await collection.findOne({ _id: new ObjectId(id) });
    if (!det) return res.status(404).json({ error: "Not found" });
    await collection.deleteOne({ _id: det._id });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete detection" });
  }
});

app.post("/api/recipes/:id/videos", async (req, res) => {
  try {
    const { steps } = req.body;
    if (!Array.isArray(steps) || !steps.length)
      return res.status(400).json({ error: "Non-empty steps array required" });

    const videos = await generateRecipeVideos(steps);
    res.status(201).json({ videos });
  } catch (e) {
    console.error("Failed to generate recipe videos", e);
    res.status(500).json({ error: e.message || "Failed to generate videos" });
  }
});

app.post("/api/recipes/:id/image", async (req, res) => {
  try {
    const { title, summary, ingredients } = req.body || {};
    if (!title) {
      return res.status(400).json({ error: "Recipe title is required" });
    }

    const imageDataUrl = await generateRecipeImage({
      title,
      summary,
      ingredients: Array.isArray(ingredients) ? ingredients : [],
    });

    res.status(201).json({ image: imageDataUrl });
  } catch (e) {
    console.error("Failed to generate recipe image", e);
    res.status(500).json({ error: e.message || "Failed to generate recipe image" });
  }
});

app.listen(PORT, () => console.log(`✅ Smart Fridge API running on port ${PORT}`));

process.on("SIGINT", async () => {
  await closeDatabase();
  process.exit(0);
});
