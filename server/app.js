/**
 * Urinalysis Patient Record System - Express Application Server
 * 
 * Provides RESTful API endpoints interfacing directly with custom linked data structures:
 *  - POST   /api/records              -> Insert test record (O(1) avg)
 *  - GET    /api/patients/:id         -> Get full history (O(1) avg lookup + O(m) serialization)
 *  - GET    /api/patients/:id/search  -> Search single record by date (O(m))
 *  - DELETE /api/patients/:id/oldest  -> Archive oldest record (O(1) avg)
 *  - GET    /api/patients/:id/trend   -> Analyte trend analysis, auto-escalates if outOfRange >= 3 (O(m))
 *  - GET    /api/review/next          -> Dequeue next patient for clinical review (O(1))
 *  - GET    /api/review/queue         -> Get current queue snapshot (O(q))
 *  - GET    /api/analytes             -> Get analyte metadata & clinical reference ranges
 *  - POST   /api/seed                 -> Seed demo clinical data for instant verification
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const {
    HashTable,
    ReviewQueue,
    NUM_ANALYTES,
    ANALYTE_NAMES,
    ANALYTE_REFERENCES
} = require('./dataStructures');

const app = express();
const PORT = process.env.PORT || 3000;
const STORAGE_FILE = path.join(__dirname, 'records_storage.json');

// Instantiate backend data structures (in-memory state)
const hashTable = new HashTable();
const reviewQueue = new ReviewQueue();

// -------------------------------------------------------------
// Data Persistence Layer (File-backed storage)
// -------------------------------------------------------------
function saveStateToFile() {
    try {
        const patients = [];
        for (let i = 0; i < hashTable.tableSize; i++) {
            let curr = hashTable.buckets[i];
            while (curr !== null) {
                patients.push({
                    patientID: curr.patientID,
                    records: curr.toArray()
                });
                curr = curr.nextInBucket;
            }
        }
        const state = {
            patients,
            reviewQueue: reviewQueue.toArray(),
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
        console.error("Error saving data to disk:", err);
    }
}

function seedInitialData() {
    // Patient P-101: Diabetic / Nephropathy tracking with elevated Glucose & Protein
    hashTable.insertTestRecord('P-101', '2026-07-05', [1.45, 0.25, 6.0, 0.6, 0.0, 0.1, 0.4, 0.0, 5.0, 1.020]);
    hashTable.insertTestRecord('P-101', '2026-07-18', [1.80, 0.30, 5.8, 0.8, 0.0, 0.1, 0.5, 0.0, 8.0, 1.022]);
    hashTable.insertTestRecord('P-101', '2026-08-02', [2.10, 0.35, 5.5, 1.1, 0.0, 0.2, 0.6, 0.0, 12.0, 1.025]);
    hashTable.insertTestRecord('P-101', '2026-08-20', [1.95, 0.28, 5.6, 0.9, 0.0, 0.1, 0.5, 0.0, 9.0, 1.023]);

    // Patient P-102: Healthy routine baseline
    hashTable.insertTestRecord('P-102', '2026-06-12', [0.35, 0.05, 6.5, 0.1, 0.0, 0.0, 0.4, 0.0, 2.0, 1.015]);
    hashTable.insertTestRecord('P-102', '2026-08-15', [0.40, 0.06, 6.4, 0.1, 0.0, 0.0, 0.5, 0.0, 3.0, 1.016]);

    // Patient P-103: Urinary Tract Infection monitoring
    hashTable.insertTestRecord('P-103', '2026-08-01', [0.30, 0.20, 7.5, 0.0, 15.0, 0.0, 0.4, 1.0, 45.0, 1.018]);
    hashTable.insertTestRecord('P-103', '2026-08-08', [0.25, 0.15, 7.2, 0.0, 10.0, 0.0, 0.4, 1.0, 35.0, 1.016]);
    hashTable.insertTestRecord('P-103', '2026-08-15', [0.20, 0.10, 6.8, 0.0, 5.0, 0.0, 0.3, 0.0, 15.0, 1.015]);

    // Seed review queue
    reviewQueue.enqueue('P-104');
    saveStateToFile();
}

function loadStateFromFile() {
    try {
        if (!fs.existsSync(STORAGE_FILE)) {
            seedInitialData();
            return;
        }
        const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.patients)) {
            for (const p of data.patients) {
                if (Array.isArray(p.records)) {
                    for (const r of p.records) {
                        hashTable.insertTestRecord(p.patientID, r.timestamp, r.analyteValues);
                    }
                }
            }
        }
        if (data && Array.isArray(data.reviewQueue)) {
            for (const id of data.reviewQueue) {
                reviewQueue.enqueue(id);
            }
        }
    } catch (err) {
        console.error("Error loading persisted data, seeding default data:", err);
        seedInitialData();
    }
}

// Initialize stored data
loadStateFromFile();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// -------------------------------------------------------------
// Metadata & Reference Endpoints
// -------------------------------------------------------------
app.get('/api/analytes', (req, res) => {
    res.json({
        numAnalytes: NUM_ANALYTES,
        analytes: ANALYTE_REFERENCES
    });
});

// -------------------------------------------------------------
// POST /api/records
// Body: { patientID, timestamp, values: number[10] }
// Time Complexity: O(1) average
// -------------------------------------------------------------
app.post('/api/records', (req, res) => {
    const { patientID, timestamp, values } = req.body;

    if (!patientID || typeof patientID !== 'string' || patientID.trim() === '') {
        return res.status(400).json({ error: "Missing or invalid 'patientID'" });
    }
    if (!timestamp || typeof timestamp !== 'string' || timestamp.trim() === '') {
        return res.status(400).json({ error: "Missing or invalid 'timestamp'" });
    }
    if (!Array.isArray(values) || values.length !== NUM_ANALYTES) {
        return res.status(400).json({ 
            error: `Field 'values' must be an array of exactly ${NUM_ANALYTES} numbers` 
        });
    }

    const trimmedID = patientID.trim();
    const trimmedTime = timestamp.trim();
    const numericValues = values.map(v => Number(v) || 0);

    const record = hashTable.insertTestRecord(trimmedID, trimmedTime, numericValues);
    const patient = hashTable.searchPatient(trimmedID);

    // Save to persistent file storage
    saveStateToFile();

    return res.status(201).json({
        success: true,
        message: `Record successfully recorded for Patient ${trimmedID}`,
        patientID: trimmedID,
        timestamp: record.timestamp,
        recordCount: patient.recordCount,
        analyteValues: Array.from(record.analyteValues)
    });
});

// -------------------------------------------------------------
// GET /api/patients/:id/search?date=YYYY-MM-DD
// Time Complexity: O(m) where m is patient record count
// -------------------------------------------------------------
app.get('/api/patients/:id/search', (req, res) => {
    const patientID = req.params.id;
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: "Query parameter 'date' is required" });
    }

    const record = hashTable.searchByDate(patientID, String(date).trim());
    if (!record) {
        return res.status(404).json({ 
            error: `No test record found for Patient '${patientID}' on date '${date}'` 
        });
    }

    return res.json({
        patientID,
        timestamp: record.timestamp,
        analyteValues: Array.from(record.analyteValues)
    });
});

// -------------------------------------------------------------
// GET /api/patients/:id/trend?analyteIndex=&low=&high=
// Time Complexity: O(m) traversal; enqueues into ReviewQueue if outOfRangeCount >= 3
// -------------------------------------------------------------
app.get('/api/patients/:id/trend', (req, res) => {
    const patientID = req.params.id;
    const analyteIndex = parseInt(req.query.analyteIndex, 10);
    const low = parseFloat(req.query.low);
    const high = parseFloat(req.query.high);

    if (isNaN(analyteIndex) || analyteIndex < 0 || analyteIndex >= NUM_ANALYTES) {
        return res.status(400).json({ 
            error: `'analyteIndex' must be an integer between 0 and ${NUM_ANALYTES - 1}` 
        });
    }
    if (isNaN(low) || isNaN(high)) {
        return res.status(400).json({ error: "Query parameters 'low' and 'high' must be valid numbers" });
    }

    const effectiveLow = Math.min(low, high);
    const effectiveHigh = Math.max(low, high);

    const report = hashTable.generateTrendReport(
        patientID, 
        analyteIndex, 
        effectiveLow, 
        effectiveHigh, 
        reviewQueue
    );

    if (!report) {
        return res.status(404).json({ 
            error: `Patient '${patientID}' not found or has no records recorded` 
        });
    }

    if (report.enqueued) {
        saveStateToFile();
    }

    return res.json(report);
});

// -------------------------------------------------------------
// DELETE /api/patients/:id/oldest
// Time Complexity: O(1) average
// -------------------------------------------------------------
app.delete('/api/patients/:id/oldest', (req, res) => {
    const patientID = req.params.id;
    const patient = hashTable.searchPatient(patientID);

    if (!patient || patient.head === null) {
        return res.status(404).json({ 
            error: `Patient '${patientID}' not found or has no records to archive` 
        });
    }

    const oldest = patient.deleteOldestRecord();
    saveStateToFile();

    return res.json({
        success: true,
        message: `Archived oldest record (${oldest.timestamp}) for Patient ${patientID}`,
        patientID,
        archivedTimestamp: oldest.timestamp,
        remainingRecords: patient.recordCount
    });
});

// -------------------------------------------------------------
// GET /api/patients/:id
// Time Complexity: O(1) average lookup + O(m) list traversal
// -------------------------------------------------------------
app.get('/api/patients/:id', (req, res) => {
    const patientID = req.params.id;
    const patient = hashTable.searchPatient(patientID);

    if (!patient) {
        return res.status(404).json({ 
            error: `Patient '${patientID}' not found in registry` 
        });
    }

    return res.json({
        patientID: patient.patientID,
        recordCount: patient.recordCount,
        records: patient.toArray()
    });
});

// -------------------------------------------------------------
// GET /api/review/next
// Dequeues next patient from FIFO Review Queue
// Time Complexity: O(1)
// -------------------------------------------------------------
app.get('/api/review/next', (req, res) => {
    const dequeuedID = reviewQueue.dequeue();
    saveStateToFile();
    return res.json({
        patientID: dequeuedID,
        remainingInQueue: reviewQueue.count
    });
});

// -------------------------------------------------------------
// GET /api/review/queue
// Returns current queue snapshot
// Time Complexity: O(q)
// -------------------------------------------------------------
app.get('/api/review/queue', (req, res) => {
    return res.json({
        count: reviewQueue.count,
        queue: reviewQueue.toArray()
    });
});

// -------------------------------------------------------------
// POST /api/seed
// Pre-loads realistic demo records to test all system features
// -------------------------------------------------------------
app.post('/api/seed', (req, res) => {
    seedInitialData();
    return res.json({
        success: true,
        message: "Seed data successfully populated (P-101 with 4 records, P-102 with 2 records, P-103 with 3 records, P-104 in review queue)"
    });
});

// Fallback to index.html for SPA navigation
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Export app for testing or programmatic launch
module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Urinalysis System running on http://localhost:${PORT}`);
    });
}
