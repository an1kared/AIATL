import { MongoClient, ServerApiVersion } from 'mongodb'

let client
let collectionPromise
let inventoryCollectionPromise

function getConfig() {
  const { MONGODB_URI, MONGODB_DB_NAME, MONGODB_COLLECTION } = process.env

  if (!MONGODB_URI) {
    throw new Error('Missing MONGODB_URI environment variable')
  }

  return {
    uri: MONGODB_URI,
    dbName: MONGODB_DB_NAME || 'ingredients',
    collectionName: MONGODB_COLLECTION || 'ingredients',
  }
}

export async function getCollection() {
  if (!collectionPromise) {
    const { uri, dbName, collectionName } = getConfig()

    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    })

    collectionPromise = client.connect().then(() => {
      console.log('Connected to MongoDB Atlas')
      return client.db(dbName).collection(collectionName)
    })
  }

  return collectionPromise
}

export async function getInventoryCollection() {
  if (!inventoryCollectionPromise) {
    const { dbName } = getConfig()
    await getCollection()
    const inventoryCollectionName = process.env.MONGODB_INVENTORY_COLLECTION || 'inventory'
    inventoryCollectionPromise = client.db(dbName).collection(inventoryCollectionName)
  }
  return inventoryCollectionPromise
}

const sanitizeCount = (value) => {
  const num = Number(value)
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return 0
  }
  return Math.max(0, Math.round(num))
}

function normalizeKey(item = {}) {
  const itemName = (item.item_name || '').trim()
  const storage = (item.storage_location || '').trim()
  return {
    item_name: itemName,
    storage_location: storage,
    emoji: (item.emoji || '').trim(),
  }
}

export async function upsertInventoryItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) return

  const inventoryCollection = await getInventoryCollection()
  const now = new Date().toISOString()

  const operations = items
    .map((item) => {
      const { item_name: itemName, storage_location: storageLocation, emoji } = normalizeKey(item)
      const count = sanitizeCount(item.item_count)

      if (!itemName || !storageLocation || count === 0) {
        return null
      }

      return {
        updateOne: {
          filter: {
            item_name: itemName,
            storage_location: storageLocation,
          },
          update: {
            $inc: { item_count: count },
            $set: {
              emoji: emoji || item.emoji || '🛒',
              updated_at: now,
            },
            $setOnInsert: {
              created_at: now,
            },
          },
          upsert: true,
        },
      }
    })
    .filter(Boolean)

  if (operations.length > 0) {
    await inventoryCollection.bulkWrite(operations, { ordered: false })
  }
}

export async function decrementInventoryItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) return

  const inventoryCollection = await getInventoryCollection()
  const operations = items
    .map((item) => {
      const { item_name: itemName, storage_location: storageLocation } = normalizeKey(item)
      const count = sanitizeCount(item.item_count)

      if (!itemName || !storageLocation || count === 0) {
        return null
      }

      return {
        updateOne: {
          filter: {
            item_name: itemName,
            storage_location: storageLocation,
          },
          update: {
            $inc: { item_count: -count },
            $set: {
              updated_at: new Date().toISOString(),
            },
          },
        },
      }
    })
    .filter(Boolean)

  if (operations.length > 0) {
    await inventoryCollection.bulkWrite(operations, { ordered: false })
    await inventoryCollection.deleteMany({ item_count: { $lte: 0 } })
  }
}

export async function listInventoryItems() {
  const inventoryCollection = await getInventoryCollection()
  let items = await inventoryCollection.find().sort({ item_name: 1 }).toArray()

  if (items.length > 0) {
    return items
  }

  const detectionCollection = await getCollection()
  const detections = await detectionCollection.find().toArray()

  if (detections.length === 0) {
    return []
  }

  const combinedMap = new Map()

  detections.forEach((detection) => {
    if (!Array.isArray(detection?.groceries)) {
      return
    }

    detection.groceries.forEach((item) => {
      const { item_name: itemName, storage_location: storageLocation, emoji } = normalizeKey(item)
      const count = sanitizeCount(item.item_count)

      if (!itemName || !storageLocation || count === 0) {
        return
      }

      const key = `${itemName.toLowerCase()}|${storageLocation.toLowerCase()}`
      const existing = combinedMap.get(key) || {
        item_name: itemName,
        storage_location: storageLocation,
        emoji: emoji || item.emoji || '🛒',
        item_count: 0,
        created_at: new Date().toISOString(),
      }

      existing.item_count += count
      existing.updated_at = new Date().toISOString()

      if (!existing.emoji && (emoji || item.emoji)) {
        existing.emoji = emoji || item.emoji
      }

      combinedMap.set(key, existing)
    })
  })

  const combinedItems = Array.from(combinedMap.values())

  if (combinedItems.length > 0) {
    await inventoryCollection.insertMany(combinedItems)
    items = await inventoryCollection.find().sort({ item_name: 1 }).toArray()
  }

  return items
}

export async function closeDatabase() {
  if (client) {
    await client.close()
    client = undefined
    collectionPromise = undefined
    inventoryCollectionPromise = undefined
  }
}

