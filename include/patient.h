#ifndef PATIENT_H
#define PATIENT_H

#define NUM_ANALYTES 10
#define TABLE_SIZE   101
#define ID_LEN       20

typedef struct TestRecord {
    char  timestamp[ID_LEN];
    float analyteValues[NUM_ANALYTES]; // order: glucose, protein, pH, ketones, 
                                        // blood, bilirubin, urobilinogen, 
                                        // nitrite, leucocytes, specific gravity
    struct TestRecord *next;
} TestRecord;

typedef struct PatientList {
    char patientID[ID_LEN];
    TestRecord *head, *tail;
    int  recordCount;
    struct PatientList *nextInBucket;
} PatientList;

typedef struct ReviewNode {
    char patientID[ID_LEN];
    struct ReviewNode *next;
} ReviewNode;

typedef struct {
    ReviewNode *front, *rear;
} ReviewQueue;

/* Standard display labels for each analyte in the required order */
extern const char *const ANALYTE_NAMES[NUM_ANALYTES];

/* Required Core Functions */
unsigned int hashID(const char *patientID);
PatientList *findOrCreatePatient(const char *patientID);
void insertTestRecord(const char *patientID, const char *timestamp, 
                      float values[NUM_ANALYTES]);
PatientList *searchPatient(const char *patientID);
TestRecord *searchByDate(const char *patientID, const char *targetDate);
int deleteOldestRecord(const char *patientID);
void generateTrendReport(const char *patientID, int analyteIndex, 
                         float lowRange, float highRange);
void enqueueForReview(const char *patientID);
char *dequeueNextReview(void);
void freeAll(void);

#endif /* PATIENT_H */
