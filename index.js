import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';
import cors from 'cors';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const app = express();
const PORT = 8000;

app.use(cors({
  origin: 'https://booknook-frontend-wheat.vercel.app',
  credentials: true,
}));
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();

const db = client.db('book-nook');
const books = db.collection('books');
const borrows = db.collection('borrows');

const unauthorizedMessage = 'Unauthorized access: invalid or missing token';
const jwtSecret = process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET;
const jwks = jwtSecret
  ? null
  : createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL || `${process.env.CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const match = typeof authHeader === 'string' ? /^Bearer\s+(\S+)$/i.exec(authHeader) : null;
  if (!match) {
    return res.status(401).send({ message: unauthorizedMessage });
  }

  let payload;
  try {
    const key = jwtSecret ? new TextEncoder().encode(jwtSecret) : jwks;
    ({ payload } = await jwtVerify(match[1], key));
  } catch {
    return res.status(401).send({ message: unauthorizedMessage });
  }

  req.user = {
    ...payload,
    id: payload.id ?? payload.sub,
  };
  return next();
};

const verifyTokenForUserFilteredBooks = (req, res, next) => {
  if (!req.query.email) return next();
  return verifyToken(req, res, next);
};

const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error(error);
    if (res.headersSent) return next(error);
    res.status(500).send({ message: 'Internal server error' });
  }
};

const getId = (id) => typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : null;

app.get('/books', verifyTokenForUserFilteredBooks, asyncHandler(async (req, res) => {
  const filter = req.query.email ? { userEmail: req.query.email } : {};
  res.send(await books.find(filter).toArray());
}));

app.get('/books/:id', asyncHandler(async (req, res) => {
  const id = getId(req.params.id);
  if (!id) return res.status(400).send({ message: 'Invalid book ID' });

  const book = await books.findOne({ _id: id });
  if (!book) return res.status(404).send({ message: 'Book not found' });
  res.send(book);
}));

app.patch('/books/:id', verifyToken, asyncHandler(async (req, res) => {
  const id = getId(req.params.id);
  if (!id) return res.status(400).send({ message: 'Invalid book ID' });

  const updates = { ...req.body };
  if (updates.totalCopies !== undefined) {
    updates.totalCopies = Number(updates.totalCopies);
    if (!Number.isFinite(updates.totalCopies)) {
      return res.status(400).send({ message: 'totalCopies must be a number' });
    }
  }

  const result = await books.updateOne({ _id: id }, { $set: updates });
  if (!result.matchedCount) return res.status(404).send({ message: 'Book not found' });
  res.send({ success: true, message: 'Book updated successfully' });
}));

app.delete('/books/:id', verifyToken, asyncHandler(async (req, res) => {
  const id = getId(req.params.id);
  if (!id) return res.status(400).send({ message: 'Invalid book ID' });

  const borrowed = await borrows.findOne({
    bookId: { $in: [req.params.id, id] },
  });
  if (borrowed) return res.status(400).send({ message: 'This book is currently borrowed.' });

  const result = await books.deleteOne({ _id: id });
  if (!result.deletedCount) return res.status(404).send({ message: 'Book not found' });
  res.send({ success: true, message: 'Book deleted successfully' });
}));

const addBook = async (req, res) => {
  if (typeof req.body.userEmail !== 'string' || !req.body.userEmail.trim()) {
    return res.status(400).send({ message: 'A user email is required to add a book.' });
  }

  if (req.body.totalCopies !== undefined) {
    req.body.totalCopies = Number(req.body.totalCopies);
    if (!Number.isFinite(req.body.totalCopies)) {
      return res.status(400).send({ message: 'totalCopies must be a number' });
    }
  }

  const result = await books.insertOne({
    ...req.body,
    createdAt: req.body.createdAt || new Date(),
  });
  res.status(201).send(result);
};

app.post('/books', verifyToken, asyncHandler(addBook));
app.post('/add-books', verifyToken, asyncHandler(addBook));

app.post('/borrows', verifyToken, asyncHandler(async (req, res) => {
  const { bookId, userEmail } = req.body;
  const id = getId(bookId);
  if (!id || typeof userEmail !== 'string' || !userEmail.trim()) {
    return res.status(400).send({ message: 'Valid bookId and userEmail are required' });
  }

  const book = await books.findOne({ _id: id });
  if (!book) return res.status(404).send({ message: 'Book not found' });
  if (book.totalCopies <= 0) return res.status(400).send({ message: 'This book is unavailable' });

  const alreadyBorrowed = await borrows.findOne({ bookId: String(bookId), userEmail });
  if (alreadyBorrowed) return res.status(400).send({ message: 'Already borrowed this book!' });

  const result = await borrows.insertOne({ ...req.body, bookId: String(bookId), createdAt: new Date() });
  await books.updateOne({ _id: id }, { $inc: { totalCopies: -1 } });
  res.status(201).send(result);
}));

app.get('/borrows', verifyToken, asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.email) filter.userEmail = req.query.email;
  if (req.query.bookId) filter.bookId = String(req.query.bookId);
  res.send(await borrows.find(filter).toArray());
}));

app.delete('/borrows/:id', verifyToken, asyncHandler(async (req, res) => {
  const id = getId(req.params.id);
  if (!id) return res.status(400).send({ message: 'Invalid borrow ID' });

  const borrow = await borrows.findOne({ _id: id });
  if (!borrow) return res.status(404).send({ message: 'Borrow not found' });

  const result = await borrows.deleteOne({ _id: id });
  const bookId = getId(borrow.bookId);
  if (bookId) await books.updateOne({ _id: bookId }, { $inc: { totalCopies: 1 } });
  res.send(result);
}));

app.get('/', (req, res) => {
  res.send('Server is running fine!')
})

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`)
})

export default app;