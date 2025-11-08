/* eslint-env node */
/* global process */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { ObjectId } from 'mongodb'
import { fileURLToPath } from 'url'
import path from 'path'
import {
  getCollection,
  closeDatabase,
  upsertInventoryItems,
  listInventoryItems,
  decrementInventoryItems,
} from './databaseClient.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })
const { PORT = 4000 } = process.env

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/detections', async (req, res) => {
  try {
    const inventoryItems = await listInventoryItems()
    res.json({ inventory: inventoryItems })
  } catch (error) {
    console.error('Failed to fetch detections', error)
    res.status(500).json({ error: 'Failed to fetch detections' })
  }
})

app.post('/api/detections', async (req, res) => {
  try {
    const { captured_date, groceries } = req.body || {}

    if (!captured_date || !Array.isArray(groceries)) {
      return res.status(400).json({
        error: 'Payload must include captured_date and groceries array.',
      })
    }

    const document = {
      captured_date: new Date(captured_date).toISOString(),
      groceries,
      created_at: new Date().toISOString(),
    }

    const collection = await getCollection()
    const result = await collection.insertOne(document)

    await upsertInventoryItems(document.groceries)
    const inventoryItems = await listInventoryItems()

    res.status(201).json({
      detection: { ...document, _id: result.insertedId },
      inventory: inventoryItems,
    })
  } catch (error) {
    console.error('Failed to save detection', error)
    res.status(500).json({ error: 'Failed to save detection' })
  }
})

app.delete('/api/detections/:id', async (req, res) => {
  try {
    const { id } = req.params
    const collection = await getCollection()
    const detection = await collection.findOne({ _id: new ObjectId(id) })

    if (!detection) {
      return res.status(404).json({ error: 'Detection not found' })
    }

    await collection.deleteOne({ _id: detection._id })
    await decrementInventoryItems(detection.groceries)
    const inventoryItems = await listInventoryItems()

    res.status(200).json({ inventory: inventoryItems })
  } catch (error) {
    console.error('Failed to delete detection', error)
    res.status(500).json({ error: 'Failed to delete detection' })
  }
})

app.listen(PORT, () => {
  console.log(`Smart Fridge API listening on port ${PORT}`)
})

process.on('SIGINT', async () => {
  await closeDatabase()
  process.exit(0)
})

