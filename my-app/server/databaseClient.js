import { MongoClient, ServerApiVersion } from 'mongodb'

let client
let collectionPromise

function getConfig() {
  const { MONGODB_URI, MONGODB_DB_NAME, MONGODB_COLLECTION } = process.env

  if (!MONGODB_URI) {
    throw new Error('Missing MONGODB_URI environment variable')
  }

  return {
    uri: MONGODB_URI,
    dbName: MONGODB_DB_NAME || 'smart-fridge',
    collectionName: MONGODB_COLLECTION || 'detections',
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

export async function closeDatabase() {
  if (client) {
    await client.close()
    client = undefined
    collectionPromise = undefined
  }
}

