#include "patient.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* Helper to read a non-empty trimmed line from standard input */
static void readString(const char *prompt, char *buffer, int maxLen) {
    while (1) {
        printf("%s", prompt);
        if (fgets(buffer, maxLen, stdin) == NULL) {
            buffer[0] = '\0';
            return;
        }

        /* Remove trailing newline and carriage return */
        size_t len = strlen(buffer);
        while (len > 0 && (buffer[len - 1] == '\n' || buffer[len - 1] == '\r')) {
            buffer[--len] = '\0';
        }

        /* Skip leading whitespace */
        char *start = buffer;
        while (*start && isspace((unsigned char)*start)) {
            start++;
        }

        if (*start != '\0') {
            if (start != buffer) {
                memmove(buffer, start, strlen(start) + 1);
            }
            break;
        }
        printf("Input cannot be empty. Please try again.\n");
    }
}

/* Helper to safely read a floating-point number */
static float readFloat(const char *prompt) {
    char buffer[64];
    float value;
    while (1) {
        printf("%s", prompt);
        if (fgets(buffer, sizeof(buffer), stdin) != NULL) {
            char extra;
            if (sscanf(buffer, "%f %c", &value, &extra) == 1) {
                return value;
            }
        }
        printf("Invalid input. Please enter a valid number.\n");
    }
}

/* Helper to safely read an integer choice */
static int readInt(const char *prompt) {
    char buffer[64];
    int value;
    while (1) {
        printf("%s", prompt);
        if (fgets(buffer, sizeof(buffer), stdin) != NULL) {
            char extra;
            if (sscanf(buffer, "%d %c", &value, &extra) == 1) {
                return value;
            }
        }
        printf("Invalid input. Please enter a valid integer.\n");
    }
}

/* Helper for case-insensitive string comparison */
static int stringEqualsIgnoreCase(const char *s1, const char *s2) {
    while (*s1 && *s2) {
        if (tolower((unsigned char)*s1) != tolower((unsigned char)*s2)) {
            return 0;
        }
        s1++;
        s2++;
    }
    return (*s1 == '\0' && *s2 == '\0');
}

/* Helper to resolve analyte name or index (1-10) to 0-based index */
static int resolveAnalyteIndex(const char *input) {
    /* Check if user typed a number (1-10) */
    char *endptr;
    long choice = strtol(input, &endptr, 10);
    if (*endptr == '\0' && choice >= 1 && choice <= NUM_ANALYTES) {
        return (int)(choice - 1);
    }

    /* Compare against analyte names */
    for (int i = 0; i < NUM_ANALYTES; i++) {
        if (stringEqualsIgnoreCase(input, ANALYTE_NAMES[i])) {
            return i;
        }
    }

    return -1;
}

/* Menu Option 1: Register new patient / add test reading */
static void handleAddTestReading(void) {
    char patientID[ID_LEN];
    char timestamp[ID_LEN];
    float values[NUM_ANALYTES];

    printf("\n--- Register / Add Test Reading ---\n");
    readString("Enter Patient ID: ", patientID, sizeof(patientID));
    readString("Enter Timestamp (e.g., 2026-08-10): ", timestamp, sizeof(timestamp));

    printf("Enter values for all %d analytes:\n", NUM_ANALYTES);
    for (int i = 0; i < NUM_ANALYTES; i++) {
        char prompt[64];
        snprintf(prompt, sizeof(prompt), "  [%d] %-16s: ", i + 1, ANALYTE_NAMES[i]);
        values[i] = readFloat(prompt);
    }

    insertTestRecord(patientID, timestamp, values);
    printf("Successfully added test record for Patient '%s'.\n", patientID);
}

/* Menu Option 2: View a patient's full history */
static void handleViewHistory(void) {
    char patientID[ID_LEN];
    printf("\n--- View Patient History ---\n");
    readString("Enter Patient ID: ", patientID, sizeof(patientID));

    PatientList *patient = searchPatient(patientID);
    if (patient == NULL || patient->head == NULL) {
        printf("No records found for patient '%s'.\n", patientID);
        return;
    }

    printf("\nFull Test Record History for Patient: %s (Total: %d record(s))\n", 
           patient->patientID, patient->recordCount);
    printf("========================================================================================\n");
    
    TestRecord *curr = patient->head;
    int index = 1;
    while (curr != NULL) {
        printf("Record #%d | Date: %s\n", index++, curr->timestamp);
        printf("  Analyte Values:\n");
        for (int i = 0; i < NUM_ANALYTES; i++) {
            printf("    - %-16s : %.2f\n", ANALYTE_NAMES[i], curr->analyteValues[i]);
        }
        printf("----------------------------------------------------------------------------------------\n");
        curr = curr->next;
    }
}

/* Menu Option 3: Search a patient's reading by date */
static void handleSearchByDate(void) {
    char patientID[ID_LEN];
    char targetDate[ID_LEN];

    printf("\n--- Search Reading by Date ---\n");
    readString("Enter Patient ID: ", patientID, sizeof(patientID));
    readString("Enter Target Date/Timestamp (e.g., 2026-08-10): ", targetDate, sizeof(targetDate));

    TestRecord *rec = searchByDate(patientID, targetDate);
    if (rec == NULL) {
        printf("No record found for patient '%s' matching timestamp '%s'.\n", 
               patientID, targetDate);
        return;
    }

    printf("\nFound Test Record for Patient '%s' on %s:\n", patientID, rec->timestamp);
    printf("----------------------------------------\n");
    for (int i = 0; i < NUM_ANALYTES; i++) {
        printf("  %-16s : %.2f\n", ANALYTE_NAMES[i], rec->analyteValues[i]);
    }
    printf("----------------------------------------\n");
}

/* Menu Option 4: Generate analyte trend report */
static void handleGenerateTrendReport(void) {
    char patientID[ID_LEN];
    char analyteInput[64];

    printf("\n--- Generate Analyte Trend Report ---\n");
    readString("Enter Patient ID: ", patientID, sizeof(patientID));

    printf("\nAvailable Analytes:\n");
    for (int i = 0; i < NUM_ANALYTES; i++) {
        printf("  %2d. %s\n", i + 1, ANALYTE_NAMES[i]);
    }

    int analyteIndex = -1;
    while (analyteIndex == -1) {
        readString("Enter Analyte Name (or number 1-10): ", analyteInput, sizeof(analyteInput));
        analyteIndex = resolveAnalyteIndex(analyteInput);
        if (analyteIndex == -1) {
            printf("Invalid analyte. Please enter a valid name from the list above.\n");
        }
    }

    float lowRange = readFloat("Enter Normal Range Minimum (low): ");
    float highRange = readFloat("Enter Normal Range Maximum (high): ");

    if (lowRange > highRange) {
        printf("Notice: Swapping low and high bounds (%.2f > %.2f).\n", lowRange, highRange);
        float temp = lowRange;
        lowRange = highRange;
        highRange = temp;
    }

    generateTrendReport(patientID, analyteIndex, lowRange, highRange);
}

/* Menu Option 5: View next patient in clinical review queue */
static void handleViewNextReview(void) {
    printf("\n--- Clinical Review Queue ---\n");
    char *patientID = dequeueNextReview();
    if (patientID == NULL) {
        printf("The clinical review queue is currently empty.\n");
    } else {
        printf("Next patient dequeued for clinical review: %s\n", patientID);
    }
}

/* Menu Option 6: Archive (delete) a patient's oldest record */
static void handleDeleteOldest(void) {
    char patientID[ID_LEN];
    printf("\n--- Archive Oldest Patient Record ---\n");
    readString("Enter Patient ID: ", patientID, sizeof(patientID));

    int success = deleteOldestRecord(patientID);
    if (success) {
        printf("Successfully archived and deleted the oldest record for patient '%s'.\n", patientID);
    } else {
        printf("Failed to archive record: Patient '%s' not found or has no records.\n", patientID);
    }
}

/* Display main menu options */
static void displayMenu(void) {
    printf("\n=======================================================\n");
    printf("     HOSPITAL URINALYSIS PATIENT RECORD SYSTEM        \n");
    printf("=======================================================\n");
    printf("1. Register new patient / Add test reading\n");
    printf("2. View a patient's full history\n");
    printf("3. Search a patient's reading by date\n");
    printf("4. Generate analyte trend report\n");
    printf("5. View next patient in clinical review queue\n");
    printf("6. Archive (delete) a patient's oldest record\n");
    printf("7. Exit\n");
    printf("=======================================================\n");
}

int main(void) {
    int choice = 0;

    while (1) {
        displayMenu();
        choice = readInt("Enter your choice (1-7): ");

        switch (choice) {
            case 1:
                handleAddTestReading();
                break;
            case 2:
                handleViewHistory();
                break;
            case 3:
                handleSearchByDate();
                break;
            case 4:
                handleGenerateTrendReport();
                break;
            case 5:
                handleViewNextReview();
                break;
            case 6:
                handleDeleteOldest();
                break;
            case 7:
                printf("\nFreeing all allocated memory and exiting...\n");
                freeAll();
                printf("System terminated cleanly.\n");
                return 0;
            default:
                printf("Invalid selection! Please enter a number between 1 and 7.\n");
                break;
        }
    }

    return 0;
}
