import express from 'express'
import { MongoClient } from 'mongodb';
import 'dotenv/config'
import cors from 'cors'

const app = express();
const PORT = 8000;


app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("book-nook");
const booksCollection = db.collection("books");

app.post("/add-books", async (req, res) => {
  try {
    const data = req.body;
    console.log("Received data:", data); 

    const result = await booksCollection.insertOne(data);
    res.status(201).send(result);
  } catch (error) {
    console.error("Error inserting data:", error);
    res.status(500).send({ message: "Failed to insert data", error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('Server is running fine!')
})

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`)
})