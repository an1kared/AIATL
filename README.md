# Sous Chef 🍳🤖

> Scan your fridge. Get a recipe. Hear it narrated. See it visualized.

Built at **AI@ATL Hackathon** · November 2025

---

## What it does

Sous Chef is a multimodal AI cooking assistant that combines vision, 
reasoning agents, and generative media. Point your camera at your 
ingredients and get a full recipe with voice narration and visual output.

---

## Pipeline

**Image Input → Gemini (grocery detection) → Recipe Reasoning Agent → Imagen (visual) + ElevenLabs (voice) → React Frontend**

1. **Gemini API** detects ingredients from camera input
2. **MongoDB** stores ingredient and recipe data
3. **Reasoning agent** generates a contextual recipe
4. **Imagen** generates a visual of the finished dish
5. **ElevenLabs** narrates the recipe with realistic voice

---

## Tech Stack

| Layer | Technology |
|---|---|
| Vision | Gemini API |
| Database | MongoDB |
| Image Generation | Imagen |
| Voice | ElevenLabs |
| Frontend | React |
| Backend | Python |
