const express = require('express');
const app = express();
const mysql = require('mysql');
const port = 3000;
const { Client } = require('@elastic/elasticsearch');
const client = new Client({ node: 'http://localhost:9200' });


const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'ecommerce',
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
  } else {
    console.log('Connected to MySQL database');
  }
});

// Route for the root URL
app.get('/category-json', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  const queryCount = 'SELECT COUNT(*) AS totalCount FROM category';
  const queryCategories = `SELECT * FROM category LIMIT ${offset}, ${pageSize}`;

  db.query(queryCount, (errCount, resultCount) => {
    if (errCount) {
      console.error('Error counting categories:', errCount);
      res.status(500).send('Internal Server Error');
      return;
    }

    const totalCount = resultCount[0].totalCount;
    db.query(queryCategories, (errCategories, categories) => {
      if (errCategories) {
        console.error('Error querying categories:', errCategories);
        res.status(500).send('Internal Server Error');
        return;
      }

      let totalPages= Math.ceil(totalCount / pageSize);
      res.json( { categories, page, pageSize, totalPages});
    });
  });
});
app.get('/category',(req,res)=>{
  res.sendFile(__dirname+"/category.html");  }
);

  // Route for the root URL
  app.get('/all-products-json', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const offset = (page - 1) * pageSize;
  
    const queryCount = 'SELECT COUNT(*) AS totalCount FROM product';
    const queryProducts = `SELECT * FROM product LIMIT ${offset}, ${pageSize}`;
  
    db.query(queryCount, (errCount, resultCount) => {
      if (errCount) {
        console.error('Error counting products:', errCount);
        res.status(500).send('Internal Server Error');
        return;
      }
  
      const totalCount = resultCount[0].totalCount;
  
      db.query(queryProducts, (errProducts, products) => {
        if (errProducts) {
          console.error('Error querying products:', errProducts);
          res.status(500).send('Internal Server Error');
          return;
        }
        const totalPages = Math.ceil(totalCount / pageSize);
        // Fetch categories for the dropdown menu
        const queryCategories = 'SELECT * FROM category';
        db.query(queryCategories, (errCategories, categories) => {
          if (errCategories) {
            console.error('Error querying categories:', errCategories);
            res.status(500).send('Internal Server Error');
            return;
          }
        res.json({ products, page, pageSize, totalPages ,categories});
      });


    });
  });});
  app.get('/all-products',(req,res)=>{
    res.sendFile(__dirname+"/products.html");  }
  );


// Route to fetch products based on category ID and pagination
app.get('/product-json/:categoryId', (req, res) => {
  const categoryId = req.params.categoryId||1;
  const page = parseInt(req.query.page) || 1;
  const pageSize = 8;
  const offset = (page - 1) * pageSize;

  const queryCount = `SELECT COUNT(*) AS totalCount FROM product WHERE cid = ${categoryId}`;
  const queryProducts = `SELECT * FROM product WHERE cid = ${categoryId} LIMIT ${offset}, ${pageSize}`;

  db.query(queryCount, (errCount, resultCount) => {
    if (errCount) {
      console.error('Error counting products:', errCount);
      res.status(500).send('Internal Server Error');
      return;
    }

    const totalCount = resultCount[0].totalCount;

    db.query(queryProducts, (errProducts, products) => {
      if (errProducts) {
        console.error('Error querying products:', errProducts);
        res.status(500).send('Internal Server Error');
        return;
      }

      // Fetch categories for the dropdown menu
      const queryCategories = 'SELECT * FROM category';
      db.query(queryCategories, (errCategories, categories) => {
        if (errCategories) {
          console.error('Error querying categories:', errCategories);
          res.status(500).send('Internal Server Error');
          return;
        }

        const totalPages=Math.ceil(totalCount/pageSize);

        // Render the EJS template with products data
        res.json({ products, categoryId, page, pageSize, totalCount, totalPages, categories });

      });
    });
  });
});
app.get('/product/:categoryId',(req,res)=>{
  res.sendFile(__dirname+"/category-product.html");  }
);


// Route for handling search results
app.get("/search-json", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const query = req.query.query;

  var down = ["under", "below", "less", "within", "down", "lesser", "in"];
  var eq = ["=", "@"];
  var up = ["over", "above", "greater", "up"];
  var extra = [",",".","/",":","[","]","rs","Rs", "amt", "Amt", "+", "-", "than",];

  var string = query.split(" ");
  var cur, sort;

  extra.forEach((val) => {
    if (query.includes(val)) {
      query = query.replace(val, "");
    }
  });

  string.forEach((val) => {
    if (down.includes(val)) {
      cur = val;
      sort = "lte";
      return;
    } else if (up.includes(val)) {
      cur = val;
      sort = "gte";
      return;
    }
  });

  if (cur) {
    var [data, price] = query.split(cur);
    var value = parseFloat(price);
  } else {
    var data = query;
    var value = 10000000;
    sort = "lte";
  }

  try {
    let body = await client.search({
      index: "products_index",
      body: {
        query: {
          bool: {
            must: [
              {
                exists: {
                  field: "discounted_price",
                },
              },
              {
                range: {
                  discounted_price: {[sort]: value,
                  },
                },
              },
            ],
            should: [
              {
                multi_match: { 
                  query: data, 
                  fields: ["pname", "brand","cname"], 
                  fuzziness: "AUTO" // Adjusted to automatically determine fuzziness
                },
              },
            ],
            minimum_should_match: 1,
          },
        },  
        _source: ["pid","pname","brand","mrp","discounted_price", "created_date","cid"],
      },
    });
    if (body && body.hits) { // Check if hits exist and total hits count is greater than 0
      let data = body.hits.hits;
      let results = data.map(hit => hit._source);
      let totalPages = Math.ceil(results.length / 5); // Assuming 10 results per page
      res.json({ results, query:req.query.query });
    }
  } catch (error) {
    console.error("Error executing Elasticsearch query:", error);
    res.status(500).send("Internal Server Error");
  } 
});

app.get('/search',(req,res)=>{
  res.sendFile(__dirname+"/search-product.html");  }
);

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  });
  