import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';
import cors from 'cors';

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());


const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('book-nook');
const booksCollection = db.collection('books');
const borrowsCollection = db.collection('borrows');


app.get('/books', async (req, res) => {
  const filter = typeof req.query.email === 'string'
    ? { userEmail: req.query.email }
    : {};
  res.send(await booksCollection.find(filter).toArray());
});

app.get('/books/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: 'Invalid book ID' });
  }
  const book = await booksCollection.findOne({ _id: new ObjectId(req.params.id) });
  if (!book) return res.status(404).send({ message: 'Book not found' });
  res.send(book);
});

app.patch('/books/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).send({ message: 'Invalid book ID' });
  if (req.body.totalCopies !== undefined) req.body.totalCopies = Number(req.body.totalCopies);
  const result = await booksCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: req.body },
  );
  if (result.matchedCount === 0) return res.status(404).send({ message: 'Book not found' });
  res.send({ success: true, message: 'Book updated successfully' });
});


app.delete('/books/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).send({ message: 'Invalid book ID' });
  const borrowRecord = await borrowsCollection.findOne({ bookId: id });
  if (borrowRecord) {
    return res.status(400).send({
      message: 'Cannot delete: this book is currently borrowed by a user.',
    });
  }
  const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) return res.status(404).send({ message: 'Book not found' });
  res.send({ success: true, message: 'Book deleted successfully' });
});

app.post('/add-books', async (req, res) => {
  if (!req.body || typeof req.body.userEmail !== 'string' || !req.body.userEmail.trim()) {
    return res.status(400).send({ message: 'A user email is required to add a book.' });
  }

  const book = {
    ...req.body,
    createdAt: req.body.createdAt || new Date(),
  };
  res.status(201).send(await booksCollection.insertOne(book));
});

app.post('/borrows', async (req, res) => {
  const { bookId, userEmail } = req.body;
  const existingBorrow = await borrowsCollection.findOne({ bookId, userEmail });
  if (existingBorrow) {
    return res.status(400).send({ message: 'Already borrowed this book!' });
  }

  const result = await borrowsCollection.insertOne(req.body);
  await booksCollection.updateOne(
    { _id: new ObjectId(bookId) },
    { $inc: { totalCopies: -1 } },
  );
  res.status(201).send(result);
});

app.get('/borrows', async (req, res) => {
  const filter = req.query.email ? { userEmail: req.query.email } : {};
  res.send(await borrowsCollection.find(filter).toArray());
});

app.delete('/borrows/:id', async (req, res) => {
  const _id = new ObjectId(req.params.id);
  const borrowRecord = await borrowsCollection.findOne({ _id });
  if (!borrowRecord) return res.status(404).send({ message: 'Borrow not found' });

  const result = await borrowsCollection.deleteOne({ _id });
  await booksCollection.updateOne(
    { _id: new ObjectId(borrowRecord.bookId) },
    { $inc: { totalCopies: 1 } },
  );
  res.send(result);
});

app.get('/', (req, res) => {
  res.send('Server is running fine!');
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});
