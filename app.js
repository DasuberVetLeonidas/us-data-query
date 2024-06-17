// Import necessary modules
const express = require("express");
const bodyParser = require("body-parser");
const { Client } = require("pg");
const app = express();
const dicomParser = require('dicom-parser'); // Import dicom-parser library
const fs = require('fs');

// Set up PostgreSQL connection
const client = new Client({
  user: "vectordb",
  host: "localhost",
  database: "ultrasounddb",
  password: "5vSKS1FD",
  port: 5432,
});
client.connect();

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.static("/mnt/LEOHDD/leo/data/US_PNG_ALL"));

// Route to display images
app.get("/", async (req, res) => {
  try {
    let images = [];

    if (Object.keys(req.query).length !== 0) {
      // Parse inputs from request query parameters
      const secondaryAnonymisedID = req.query.secondaryAnonymisedID || "bcbd98f0924Qkf2cduacr9703a4b585";
      const studyDate = req.query.studyDate ? new Date(req.query.studyDate) : new Date("2013-07-04");
      const daysRange = req.query.daysRange ? parseInt(req.query.daysRange) : 15;

      const startDate = new Date(studyDate);
      startDate.setDate(startDate.getDate() - daysRange);
      const endDate = new Date(studyDate);
      endDate.setDate(endDate.getDate() + daysRange);

      const sqlQuery =
        "SELECT PNG_Path, Study_Date_Time FROM full_dcms.DCMs_and_PNGs WHERE Secondary_Anonymised_ID = $1 AND Study_Date_Time BETWEEN $2 AND $3";
      const { rows } = await client.query(sqlQuery, [
        secondaryAnonymisedID,
        startDate,
        endDate,
      ]);

      // Modify image paths to remove the prefix
      images = rows.map(row => {
        return {
          png_path: row.png_path.replace('/mnt/LEOHDD/leo/data/US_PNG_ALL', ''),
          study_date_time: row.study_date_time
        };
      });
    }

    res.render("index", { images });
  } catch (error) {
    console.error("Error retrieving images:", error);
    res.status(500).send("Error retrieving images");
  }
});

// Route to search images based on DCM path and find other images from the same patient on the same day
app.get("/search", async (req, res) => {
  try {
    const dcmPath = req.query.dcmPath || "";
    const daysRange = req.query.daysRange ? parseInt(req.query.daysRange) : 15; // Default to 15 days if not provided

    const sqlQueryDcm =
      "SELECT * FROM full_dcms.DCMs_and_PNGs WHERE DCM_Path = $1";
    const { rows: dcmRows } = await client.query(sqlQueryDcm, [dcmPath]);

    if (dcmRows.length === 0) {
      // If no images found for the provided DCM path, return an empty result
      return res.render("search", { images: [] });
    }

    const { secondary_anonymised_id, study_date_time } = dcmRows[0];
    
    // Calculate start and end dates based on the days range
    const startDate = new Date(study_date_time);
    startDate.setDate(startDate.getDate() - daysRange);
    const endDate = new Date(study_date_time);
    endDate.setDate(endDate.getDate() + daysRange);

    // Find other images from the same patient within the specified days range
    const sqlQueryOtherImages =
      "SELECT * FROM full_dcms.DCMs_and_PNGs WHERE secondary_anonymised_id = $1 AND study_date_time::date BETWEEN $2 AND $3";
    const { rows: otherImagesRows } = await client.query(sqlQueryOtherImages, [secondary_anonymised_id, startDate, endDate]);

    // Modify image paths to remove the prefix
    const images = otherImagesRows.map(row => ({
      png_path: row.png_path.replace('/mnt/LEOHDD/leo/data/US_PNG_ALL', ''),
      study_date_time: row.study_date_time,
      dcm_path: row.dcm_path // Add the DICOM file path to each image object
    }));

    // Insert the query image at the beginning of the images array
    images.unshift({
      png_path: dcmRows[0].png_path.replace('/mnt/LEOHDD/leo/data/US_PNG_ALL', ''),
      study_date_time: dcmRows[0].study_date_time,
      dcm_path: dcmPath // Add the DICOM file path to the query image object
    });
    
    res.render("search", { images });
  } catch (error) {
    console.error("Error searching images:", error);
    res.status(500).send("Error searching images");
  }
});


// Route to display DICOM metadata
app.get("/metadata", (req, res) => {
  try {
    const dcmPath = req.query.dcmPath || ""; // Get the DICOM file path from the query parameter

    console.log(dcmPath)
    // Read the DICOM file and parse its metadata
    const dicomData = fs.readFileSync(dcmPath);
    const dataSet = dicomParser.parseDicom(dicomData);


    // Extract metadata properties from the DICOM dataset
    const metadata = {
      // patientName: dataSet.string('x00100010'),
      studyDate: dataSet.string('x00080020'),
      // Add more metadata properties as needed
      // textAnnotations: dataSet.string('x00700008')
      pixelSpacings:dataSet.string('x00280030')
    };

    // Render a template to display the metadata
    res.render("metadata", { metadata });
  } catch (error) {
    console.error("Error retrieving DICOM metadata:", error);
    res.status(500).send("Error retrieving DICOM metadata");
  }
});

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
