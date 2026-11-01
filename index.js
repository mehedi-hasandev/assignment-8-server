import express from 'express'
import { MongoClient, ObjectId } from 'mongodb';
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
    console.error("Failed to connect to MongoDB:", err);
    throw err;
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("book-nook");
const booksCollection = db.collection("books");
const borrowsCollection = db.collection("borrows");

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

app.get("/books", async (req, res) => {
  try {
    const result = await booksCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).send({ message: "Failed to fetch books" });
  }
});

app.get("/books/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid book ID" });
  }

  try {
    const result = await booksCollection.findOne({ _id: new ObjectId(id) });
    if (!result) {
      return res.status(404).send({ message: "Book not found" });
    }

    res.send(result);
  } catch (error) {
    console.error("Error fetching book:", error);
    res.status(500).send({ message: "Failed to fetch book" });
  }
});

app.post("/borrows", async (req, res) => {
  try {
    const result = await borrowsCollection.insertOne(req.body);
    res.status(201).send(result);
  } catch (error) {
    console.error("Error creating borrow:", error);
    res.status(500).send({ message: "Failed to create borrow" });
  }
});

app.get("/borrows", async (req, res) => {
  try {
    const result = await borrowsCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching borrows:", error);
    res.status(500).send({ message: "Failed to fetch borrows" });
  }
});

app.get('/', (req, res) => {
  res.send('Server is running fine!')
})

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`)
})