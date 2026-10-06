/**
 * Urinalysis Patient Record System - Core Data Structures
 * 
 * Re-implements in JavaScript the exact C backend data structures:
 *  1. Hash Table with separate chaining (101 buckets, polynomial rolling hash) -> O(1) avg lookup
 *  2. Singly Linked List with head and tail pointers for patient records -> O(1) append, O(1) delete oldest
 *  3. FIFO Linked List Queue with front and rear pointers for review queue -> O(1) enqueue, O(1) dequeue
 */

const NUM_ANALYTES = 10;
const TABLE_SIZE = 101;
const ID_LEN = 20;

// Standard display labels for all 10 urinalysis analytes (matching patient.h / patient.c)
const ANALYTE_NAMES = Object.freeze([
    "Glucose",
    "Protein",
    "pH",
    "Ketones",
    "Blood",
    "Bilirubin",
    "Urobilinogen",
    "Nitrite",
    "Leucocytes",
    "Specific Gravity"
]);

// Clinical reference ranges (low, high, unit) for clinical utility
const ANALYTE_REFERENCES = Object.freeze([
    { name: "Glucose", low: 0.0, high: 0.8, unit: "mmol/L" },
    { name: "Protein", low: 0.0, high: 0.15, unit: "g/L" },
    { name: "pH", low: 4.5, high: 8.0, unit: "pH" },
    { name: "Ketones", low: 0.0, high: 0.5, unit: "mmol/L" },
    { name: "Blood", low: 0.0, high: 0.0, unit: "Ery/µL" },
    { name: "Bilirubin", low: 0.0, high: 0.2, unit: "mg/dL" },
    { name: "Urobilinogen", low: 0.2, high: 1.0, unit: "mg/dL" },
    { name: "Nitrite", low: 0.0, high: 0.0, unit: "pos/neg" },
    { name: "Leucocytes", low: 0.0, high: 10.0, unit: "Leu/µL" },
    { name: "Specific Gravity", low: 1.005, high: 1.030, unit: "SG" }
]);

/**
 * Node class representing a single urinalysis test record.
 * Mirrors C struct TestRecord:
 *   char timestamp[ID_LEN];
 *   float analyteValues[10];
 *   struct TestRecord *next;
 */
class TestRecord {
    constructor(timestamp, values) {
        this.timestamp = String(timestamp);
        // Ensure values has exactly NUM_ANALYTES floats
        this.analyteValues = new Float32Array(NUM_ANALYTES);
        for (let i = 0; i < NUM_ANALYTES; i++) {
            this.analyteValues[i] = Number(values && values[i] !== undefined ? values[i] : 0.0);
        }
        // Singly linked list pointer
        this.next = null;
    }
}

/**
 * Singly linked list for an individual patient's chronological test records.
 * Mirrors C struct PatientList:
 *   char patientID[ID_LEN];
 *   TestRecord *head, *tail;
 *   int recordCount;
 *   struct PatientList *nextInBucket;
 */
class PatientList {
    constructor(patientID) {
        this.patientID = String(patientID);
        this.head = null;
        this.tail = null;
        this.recordCount = 0;
        // Collision chain pointer for hash table bucket
        this.nextInBucket = null;
    }

    /**
     * Appends a new test record to the patient's chronological list.
     * Time Complexity: O(1) - utilizes tail pointer directly.
     */
    appendRecord(timestamp, values) {
        const newRecord = new TestRecord(timestamp, values);
        if (this.head === null) {
            this.head = newRecord;
            this.tail = newRecord;
        } else {
            this.tail.next = newRecord;
            this.tail = newRecord;
        }
        this.recordCount++;
        return newRecord;
    }

    /**
     * Searches for a record by exact timestamp / date string.
     * Time Complexity: O(m) where m is the number of records for this patient.
     */
    searchByDate(targetDate) {
        let curr = this.head;
        while (curr !== null) {
            if (curr.timestamp === targetDate) {
                return curr;
            }
            curr = curr.next;
        }
        return null;
    }

    /**
     * Deletes and archives the oldest record (at head of list).
     * Time Complexity: O(1) - head pointer removal.
     * Returns the removed TestRecord or null if list is empty.
     */
    deleteOldestRecord() {
        if (this.head === null) {
            return null;
        }
        const oldest = this.head;
        this.head = this.head.next;
        if (this.head === null) {
            this.tail = null;
        }
        this.recordCount--;
        return oldest;
    }

    /**
     * Traverses the linked list to serialize records for API responses.
     * Time Complexity: O(m) where m is the number of records.
     */
    toArray() {
        const list = [];
        let curr = this.head;
        while (curr !== null) {
            list.push({
                timestamp: curr.timestamp,
                analyteValues: Array.from(curr.analyteValues)
            });
            curr = curr.next;
        }
        return list;
    }
}

/**
 * Node class representing an entry in the Clinical Review Queue.
 * Mirrors C struct ReviewNode:
 *   char patientID[ID_LEN];
 *   struct ReviewNode *next;
 */
class ReviewNode {
    constructor(patientID) {
        this.patientID = String(patientID);
        this.next = null;
    }
}

/**
 * FIFO Linked List Queue for patients flagged for clinical review.
 * Mirrors C ReviewQueue:
 *   ReviewNode *front, *rear;
 */
class ReviewQueue {
    constructor() {
        this.front = null;
        this.rear = null;
        this.count = 0;
    }

    /**
     * Enqueues a patient ID at the rear of the queue.
     * Time Complexity: O(1) - uses rear pointer.
     */
    enqueue(patientID) {
        if (!patientID) return;
        const newNode = new ReviewNode(patientID);
        if (this.rear === null) {
            this.front = newNode;
            this.rear = newNode;
        } else {
            this.rear.next = newNode;
            this.rear = newNode;
        }
        this.count++;
    }

    /**
     * Dequeues and returns the patient ID from the front of the queue.
     * Time Complexity: O(1) - uses front pointer.
     * Returns patientID string or null if empty.
     */
    dequeue() {
        if (this.front === null) {
            return null;
        }
        const patientID = this.front.patientID;
        this.front = this.front.next;
        if (this.front === null) {
            this.rear = null;
        }
        this.count--;
        return patientID;
    }

    /**
     * Checks if queue is empty.
     * Time Complexity: O(1)
     */
    isEmpty() {
        return this.front === null;
    }

    /**
     * Traverses the queue from front to rear to list all pending patients.
     * Time Complexity: O(q) where q is the number of items in the queue.
     */
    toArray() {
        const result = [];
        let curr = this.front;
        while (curr !== null) {
            result.push(curr.patientID);
            curr = curr.next;
        }
        return result;
    }
}

/**
 * Hash Table with separate chaining collision resolution.
 * Mirrors C static PatientList *hashTable[TABLE_SIZE = 101].
 */
class HashTable {
    constructor(size = TABLE_SIZE) {
        this.tableSize = size;
        // Fixed-size bucket array pointing to linked list collision chains
        this.buckets = new Array(this.tableSize).fill(null);
    }

    /**
     * Polynomial rolling hash function identical to C implementation:
     *   sum = (sum * 31 + charCode) % TABLE_SIZE
     * Time Complexity: O(1) [bounded by ID length]
     */
    hashID(patientID) {
        let sum = 0;
        const str = String(patientID);
        for (let i = 0; i < str.length; i++) {
            sum = (sum * 31 + str.charCodeAt(i)) % this.tableSize;
        }
        return sum;
    }

    /**
     * Searches for a patient by ID in the hash table.
     * Time Complexity: O(1) average, O(n) worst case with collisions.
     */
    searchPatient(patientID) {
        if (!patientID) return null;
        const bucket = this.hashID(patientID);
        let curr = this.buckets[bucket];
        while (curr !== null) {
            if (curr.patientID === patientID) {
                return curr;
            }
            curr = curr.nextInBucket;
        }
        return null;
    }

    /**
     * Finds existing patient node or creates a new PatientList node
     * inserted at the head of the bucket collision chain.
     * Time Complexity: O(1) average.
     */
    findOrCreatePatient(patientID) {
        if (!patientID) return null;
        const existing = this.searchPatient(patientID);
        if (existing !== null) {
            return existing;
        }

        const newPatient = new PatientList(patientID);
        const bucket = this.hashID(patientID);

        // Prepend to bucket collision chain
        newPatient.nextInBucket = this.buckets[bucket];
        this.buckets[bucket] = newPatient;
        return newPatient;
    }

    /**
     * Inserts a test record for a patient.
     * Time Complexity: O(1) average (O(1) hash lookup + O(1) tail append).
     */
    insertTestRecord(patientID, timestamp, values) {
        if (!patientID || !timestamp || !values) return null;
        const patient = this.findOrCreatePatient(patientID);
        if (!patient) return null;
        return patient.appendRecord(timestamp, values);
    }

    /**
     * Searches for a specific test record by date.
     * Time Complexity: O(1) average lookup + O(m) date traversal.
     */
    searchByDate(patientID, targetDate) {
        const patient = this.searchPatient(patientID);
        if (!patient) return null;
        return patient.searchByDate(targetDate);
    }

    /**
     * Deletes the oldest record for the given patient.
     * Time Complexity: O(1) average.
     */
    deleteOldestRecord(patientID) {
        const patient = this.searchPatient(patientID);
        if (!patient || patient.head === null) {
            return false;
        }
        patient.deleteOldestRecord();
        return true;
    }

    /**
     * Generates trend analysis for a patient's analyte across all visits.
     * Mirrors generateTrendReport() from patient.c:
     *   - counts readings out of [lowRange, highRange]
     *   - if outOfRangeCount >= 3, enqueues patient into reviewQueue
     * Time Complexity: O(m) where m is number of patient's test records.
     */
    generateTrendReport(patientID, analyteIndex, lowRange, highRange, reviewQueue) {
        const patient = this.searchPatient(patientID);
        if (!patient || patient.head === null) {
            return null;
        }

        if (analyteIndex < 0 || analyteIndex >= NUM_ANALYTES) {
            throw new Error(`Analyte index ${analyteIndex} out of bounds (0-${NUM_ANALYTES - 1})`);
        }

        const dataPoints = [];
        let outOfRangeCount = 0;
        let curr = patient.head;

        while (curr !== null) {
            const val = curr.analyteValues[analyteIndex];
            const isOutOfRange = val < lowRange || val > highRange;
            if (isOutOfRange) {
                outOfRangeCount++;
            }
            dataPoints.push({
                timestamp: curr.timestamp,
                value: Number(val.toFixed(2)),
                isOutOfRange
            });
            curr = curr.next;
        }

        const verdict = outOfRangeCount >= 3 ? "Needs Clinical Review" : "Normal";
        let enqueued = false;

        if (outOfRangeCount >= 3 && reviewQueue) {
            reviewQueue.enqueue(patientID);
            enqueued = true;
        }

        return {
            patientID: patient.patientID,
            analyteIndex,
            analyteName: ANALYTE_NAMES[analyteIndex],
            lowRange,
            highRange,
            totalRecords: patient.recordCount,
            outOfRangeCount,
            verdict,
            enqueued,
            dataPoints
        };
    }
}

module.exports = {
    NUM_ANALYTES,
    TABLE_SIZE,
    ANALYTE_NAMES,
    ANALYTE_REFERENCES,
    TestRecord,
    PatientList,
    ReviewNode,
    ReviewQueue,
    HashTable
};
