const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to MySQL database');
});

// Get all cars
app.get('/api/cars', (req, res) => {
  db.query('SELECT * FROM cars WHERE available = true', (err, results) => {
    if (err) {
      console.error('Error fetching cars:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(results);
  });
});

// Get all customers
app.get('/api/customers', (req, res) => {
  db.query('SELECT * FROM customers', (err, results) => {
    if (err) {
      console.error('Error fetching customers:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(results);
  });
});

// Add a new customer
app.post('/api/customers', (req, res) => {
  const { name, email, phone } = req.body;
  db.query(
    'INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)',
    [name, email, phone],
    (err, result) => {
      if (err) {
        console.error('Error adding new customer:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: result.insertId, name, email, phone });
    }
  );
});

// Create a new rental
app.post('/api/rentals', (req, res) => {
  const { customer_id, car_id, rental_date } = req.body;
  console.log(customer_id, car_id, rental_date);
  
  db.query(
    'INSERT INTO rentals (customer_id, car_id, rental_date) VALUES (?, ?, ?)',
    [customer_id, car_id, rental_date],
    (err, result) => {
      if (err) {
        console.error('Error creating new rental:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      // Update car availability
      db.query(
        'UPDATE cars SET available = false WHERE id = ?',
        [car_id],
        (err) => {
          if (err) {
            console.error('Error updating car availability:', err);
            res.status(500).json({ error: err.message });
            return;
          }
          res.json({ id: result.insertId, customer_id, car_id, rental_date });
        }
      );
    }
  );
});

// Get active rentals (not returned)
app.get('/api/rentals/active', (req, res) => {
  db.query(
    `select cars.brand, cars.model, c.name, r.rental_date, r.id, cars.price_per_day from cars, customers c, rentals r where r.customer_id = c.id and r.car_id = cars.id and r.return_date is NULL;`,
    (err, results) => {
      if (err) {
        console.error('Error fetching active rentals:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(results);
    }
  );
});

// Add this new endpoint for returning rentals with payment processing
app.post('/api/rentals/return', (req, res) => {
  const { rentalId, returnDate, totalPrice } = req.body;
  
  // Validate input
  if (!rentalId || !returnDate || !totalPrice) {
    return res.status(400).json({ error: 'Missing required fields', received: req.body });
  }
  
  console.log('Return request received:', { rentalId, returnDate, totalPrice });
  
  // First update the rental with return date and total_price
  db.query(
    'UPDATE rentals SET return_date = ?, total_price = ? WHERE id = ?',
    [returnDate, totalPrice, rentalId],
    (err, results) => {
      if (err) {
        console.error('Error updating rental:', err);
        return res.status(500).json({ error: err.message });
      }
      
      if (results.affectedRows === 0) {
        return res.status(404).json({ error: 'Rental not found', rentalId });
      }
      
      // Then get the car_id from the rental
      db.query(
        'SELECT car_id FROM rentals WHERE id = ?',
        [rentalId],
        (err, results) => {
          if (err) {
            console.error('Error fetching rental details:', err);
            return res.status(500).json({ error: err.message });
          }
          
          if (results.length === 0) {
            return res.status(404).json({ error: 'Rental not found after update' });
          }
          
          const carId = results[0].car_id;
          
          // Update car availability
          db.query(
            'UPDATE cars SET available = true WHERE id = ?',
            [carId],
            (err) => {
              if (err) {
                console.error('Error updating car availability:', err);
                return res.status(500).json({ error: err.message });
              }
              
              res.json({ 
                message: 'Rental completed successfully',
                returnDate,
                amountPaid: totalPrice
              });
            }
          );
        }
      );
    }
  );
});

// Return a car_id
app.post('/api/rentals/:id/return', (req, res) => {
  const rentalId = req.params.id;
  
  // First get the car_id from the rental
  db.query(
    'SELECT car_id FROM rentals WHERE id = ?',
    [rentalId],
    (err, results) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (results.length === 0) {
        res.status(404).json({ error: 'Rental not found' });
        return;
      }
      
      const carId = results[0].car_id;
      
      // Update car availability
      db.query(
        'UPDATE cars SET available = true WHERE id = ?',
        [carId],
        (err) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          res.json({ message: 'Car returned successfully' });
        }
      );
    }
  );
});

app.get('/api/rentals/history', (req, res) => {
  db.query('select r.id, r.rental_date, r.return_date, r.total_price, c.name, car.model, car.brand from rentals r, cars car, customers c where r.customer_id = c.id and r.car_id = car.id', (err, results) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    res.json(results);
  });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 