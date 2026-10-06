# Makefile for Hospital Urinalysis Patient Record System
# Standard: C99

CC = gcc
CFLAGS = -Wall -Wextra -std=c99 -Iinclude

SRCS = src/main.c src/patient.c
OBJS = src/main.o src/patient.o
BIN_DIR = bin
TARGET = $(BIN_DIR)/patient_system

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(OBJS) | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $(OBJS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

$(BIN_DIR):
	@mkdir -p $(BIN_DIR) 2>/dev/null || mkdir $(BIN_DIR) 2>nul || true

clean:
	@rm -f $(OBJS) $(TARGET) $(TARGET).exe 2>/dev/null || del /Q /F src\*.o bin\patient_system.exe 2>nul || true
