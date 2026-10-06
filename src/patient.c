#include "patient.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Display labels for all 10 urinalysis analytes */
const char *const ANALYTE_NAMES[NUM_ANALYTES] = {
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
};

/*
 * Hash Table: Array of 101 buckets, each pointing to the head of a
 * singly linked collision chain of PatientList nodes.
 */
static PatientList *hashTable[TABLE_SIZE] = {NULL};

/*
 * Review Queue: FIFO linked list with front and rear pointers.
 */
static ReviewQueue reviewQueue = {NULL, NULL};

/*
 * Function: hashID
 * Time Complexity: O(1) [bounded by ID_LEN; polynomial rolling hash]
 * Description: Computes a polynomial rolling hash on the patientID string:
 *              sum = sum * 31 + char, modulo TABLE_SIZE (101).
 */
unsigned int hashID(const char *patientID) {
    unsigned int sum = 0;
    while (*patientID != '\0') {
        sum = (sum * 31 + (unsigned char)(*patientID)) % TABLE_SIZE;
        patientID++;
    }
    return sum;
}

/*
 * Function: searchPatient
 * Time Complexity: O(1) average
 * Description: Hashes patientID and traverses the collision chain in the corresponding
 *              bucket using strcmp to locate the patient node. Returns NULL if not found.
 */
PatientList *searchPatient(const char *patientID) {
    if (patientID == NULL) {
        return NULL;
    }

    unsigned int bucket = hashID(patientID);
    PatientList *curr = hashTable[bucket];

    while (curr != NULL) {
        if (strcmp(curr->patientID, patientID) == 0) {
            return curr;
        }
        curr = curr->nextInBucket;
    }

    return NULL;
}

/*
 * Function: findOrCreatePatient
 * Time Complexity: O(1) average
 * Description: Searches for patientID in O(1) average time. If found, returns it.
 *              Otherwise, allocates a new PatientList node, initializes its head/tail
 *              pointers and recordCount, and inserts it at the head of the bucket chain.
 */
PatientList *findOrCreatePatient(const char *patientID) {
    if (patientID == NULL) {
        return NULL;
    }

    PatientList *existing = searchPatient(patientID);
    if (existing != NULL) {
        return existing;
    }

    /* Allocate new patient node */
    PatientList *newPatient = (PatientList *)malloc(sizeof(PatientList));
    if (newPatient == NULL) {
        fprintf(stderr, "Error: Memory allocation failed for new patient.\n");
        return NULL;
    }

    strncpy(newPatient->patientID, patientID, ID_LEN - 1);
    newPatient->patientID[ID_LEN - 1] = '\0';
    newPatient->head = NULL;
    newPatient->tail = NULL;
    newPatient->recordCount = 0;

    /* Insert at the beginning of the bucket collision chain */
    unsigned int bucket = hashID(patientID);
    newPatient->nextInBucket = hashTable[bucket];
    hashTable[bucket] = newPatient;

    return newPatient;
}

/*
 * Function: insertTestRecord
 * Time Complexity: O(1) average
 * Description: Locates or creates a patient in O(1) average time, creates a new
 *              TestRecord node, and appends it in O(1) using the patient's tail pointer.
 */
void insertTestRecord(const char *patientID, const char *timestamp, 
                      float values[NUM_ANALYTES]) {
    if (patientID == NULL || timestamp == NULL || values == NULL) {
        return;
    }

    PatientList *patient = findOrCreatePatient(patientID);
    if (patient == NULL) {
        return;
    }

    TestRecord *newRecord = (TestRecord *)malloc(sizeof(TestRecord));
    if (newRecord == NULL) {
        fprintf(stderr, "Error: Memory allocation failed for test record.\n");
        return;
    }

    strncpy(newRecord->timestamp, timestamp, ID_LEN - 1);
    newRecord->timestamp[ID_LEN - 1] = '\0';
    for (int i = 0; i < NUM_ANALYTES; i++) {
        newRecord->analyteValues[i] = values[i];
    }
    newRecord->next = NULL;

    /* Append to the end of the singly linked list using tail pointer */
    if (patient->head == NULL) {
        patient->head = newRecord;
        patient->tail = newRecord;
    } else {
        patient->tail->next = newRecord;
        patient->tail = newRecord;
    }
    patient->recordCount++;
}

/*
 * Function: searchByDate
 * Time Complexity: O(m) where m is the number of test records for this patient
 * Description: Traverses the patient's singly linked list of TestRecord nodes
 *              comparing timestamps with strcmp until a match is found.
 */
TestRecord *searchByDate(const char *patientID, const char *targetDate) {
    if (patientID == NULL || targetDate == NULL) {
        return NULL;
    }

    PatientList *patient = searchPatient(patientID);
    if (patient == NULL || patient->head == NULL) {
        return NULL;
    }

    TestRecord *curr = patient->head;
    while (curr != NULL) {
        if (strcmp(curr->timestamp, targetDate) == 0) {
            return curr;
        }
        curr = curr->next;
    }

    return NULL;
}

/*
 * Function: deleteOldestRecord
 * Time Complexity: O(1)
 * Description: Deletes and frees the oldest record (at the head of the patient's
 *              linked list) and updates head and tail pointers. Returns 1 if deleted, 0 otherwise.
 */
int deleteOldestRecord(const char *patientID) {
    if (patientID == NULL) {
        return 0;
    }

    PatientList *patient = searchPatient(patientID);
    if (patient == NULL || patient->head == NULL) {
        return 0;
    }

    TestRecord *oldest = patient->head;
    patient->head = patient->head->next;

    /* If list is now empty, reset tail pointer */
    if (patient->head == NULL) {
        patient->tail = NULL;
    }

    free(oldest);
    patient->recordCount--;
    return 1;
}

/*
 * Function: enqueueForReview
 * Time Complexity: O(1)
 * Description: Creates a ReviewNode with the patientID and appends it to the rear
 *              of the FIFO ReviewQueue in O(1) time using the rear pointer.
 */
void enqueueForReview(const char *patientID) {
    if (patientID == NULL) {
        return;
    }

    ReviewNode *newNode = (ReviewNode *)malloc(sizeof(ReviewNode));
    if (newNode == NULL) {
        fprintf(stderr, "Error: Memory allocation failed for ReviewNode.\n");
        return;
    }

    strncpy(newNode->patientID, patientID, ID_LEN - 1);
    newNode->patientID[ID_LEN - 1] = '\0';
    newNode->next = NULL;

    if (reviewQueue.rear == NULL) {
        reviewQueue.front = newNode;
        reviewQueue.rear = newNode;
    } else {
        reviewQueue.rear->next = newNode;
        reviewQueue.rear = newNode;
    }
}

/*
 * Function: dequeueNextReview
 * Time Complexity: O(1)
 * Description: Removes and frees the front node from ReviewQueue in O(1) time,
 *              copying the patientID into a static buffer. Returns pointer to
 *              the buffer, or NULL if the queue is empty.
 */
char *dequeueNextReview(void) {
    if (reviewQueue.front == NULL) {
        return NULL;
    }

    ReviewNode *temp = reviewQueue.front;
    static char dequeuedID[ID_LEN];
    strncpy(dequeuedID, temp->patientID, ID_LEN - 1);
    dequeuedID[ID_LEN - 1] = '\0';

    reviewQueue.front = reviewQueue.front->next;
    if (reviewQueue.front == NULL) {
        reviewQueue.rear = NULL;
    }

    free(temp);
    return dequeuedID;
}

/*
 * Function: generateTrendReport
 * Time Complexity: O(m) where m is the number of test records for this patient
 * Description: Traverses all records of the patient, prints each timestamp and value
 *              for analyteIndex, and counts out-of-range readings against [lowRange, highRange].
 *              If out-of-range count >= 3, enqueues patient for review and prints
 *              "Needs Clinical Review", otherwise prints "Normal".
 */
void generateTrendReport(const char *patientID, int analyteIndex, 
                         float lowRange, float highRange) {
    if (patientID == NULL) {
        printf("Invalid patient ID.\n");
        return;
    }

    if (analyteIndex < 0 || analyteIndex >= NUM_ANALYTES) {
        printf("Invalid analyte index.\n");
        return;
    }

    PatientList *patient = searchPatient(patientID);
    if (patient == NULL) {
        printf("Patient '%s' not found.\n", patientID);
        return;
    }

    if (patient->head == NULL) {
        printf("No test records found for patient '%s'.\n", patientID);
        return;
    }

    printf("\n=======================================================\n");
    printf("              ANALYTE TREND REPORT                     \n");
    printf("=======================================================\n");
    printf("Patient ID   : %s\n", patientID);
    printf("Analyte      : %s\n", ANALYTE_NAMES[analyteIndex]);
    printf("Normal Range : %.2f - %.2f\n", lowRange, highRange);
    printf("-------------------------------------------------------\n");
    printf("%-16s | %-12s | %-18s\n", "Timestamp", "Reading", "Status");
    printf("-------------------------------------------------------\n");

    int outOfRangeCount = 0;
    TestRecord *curr = patient->head;
    while (curr != NULL) {
        float val = curr->analyteValues[analyteIndex];
        const char *status = "Normal";

        if (val < lowRange || val > highRange) {
            status = "OUT OF RANGE";
            outOfRangeCount++;
        }

        printf("%-16s | %-12.2f | %-18s\n", curr->timestamp, val, status);
        curr = curr->next;
    }

    printf("-------------------------------------------------------\n");
    printf("Total Out-of-Range Readings: %d\n", outOfRangeCount);
    printf("Clinical Status            : ");

    if (outOfRangeCount >= 3) {
        enqueueForReview(patientID);
        printf("Needs Clinical Review\n");
    } else {
        printf("Normal\n");
    }
    printf("=======================================================\n\n");
}

/*
 * Function: freeAll
 * Time Complexity: O(N + R + Q) where N is patient count, R is total records,
 *                  and Q is review queue items.
 * Description: Walks every bucket in the hash table and frees all PatientList
 *              nodes and all their attached TestRecord nodes. Also frees all
 *              nodes in the ReviewQueue to ensure zero memory leaks at program exit.
 */
void freeAll(void) {
    /* 1. Free all patient nodes and their test record linked lists */
    for (int i = 0; i < TABLE_SIZE; i++) {
        PatientList *currPatient = hashTable[i];
        while (currPatient != NULL) {
            TestRecord *currRecord = currPatient->head;
            while (currRecord != NULL) {
                TestRecord *tempRecord = currRecord;
                currRecord = currRecord->next;
                free(tempRecord);
            }
            PatientList *tempPatient = currPatient;
            currPatient = currPatient->nextInBucket;
            free(tempPatient);
        }
        hashTable[i] = NULL;
    }

    /* 2. Free any remaining nodes in the review queue */
    ReviewNode *currQueue = reviewQueue.front;
    while (currQueue != NULL) {
        ReviewNode *tempQueue = currQueue;
        currQueue = currQueue->next;
        free(tempQueue);
    }
    reviewQueue.front = NULL;
    reviewQueue.rear = NULL;
}
