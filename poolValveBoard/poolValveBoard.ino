// Include the libraries we need
#include <Wire.h>

#define  SLAVE_ADDRESS 0x17
#define  REG_MAP_SIZE             11
#define  MAX_SENT_BYTES       4

#include <OneWire.h>
#include <DallasTemperature.h>

#define ONE_WIRE_BUS 10
// Setup a oneWire instance to communicate with any OneWire devices (not just Maxim/Dallas temperature ICs)
OneWire oneWire(ONE_WIRE_BUS);

// Pass our oneWire reference to Dallas Temperature.
DallasTemperature sensors(&oneWire);

// arrays to hold device addresses
DeviceAddress thermometer[8];
const int analogPin[] = {A0, A1, A2, A3};
int analogValues[4];
const byte outputPins[] = {2, 3, 4, 5, 6, 7, 8, 9};
byte thermometerCount = 0;
byte registerMap[REG_MAP_SIZE];
byte receivedCommands[MAX_SENT_BYTES];
unsigned long currentMillis = 0;
unsigned long relayTime[4];
byte relayPin[4];
byte relayOn[4];

void setup() {
  // start serial port
  Serial.begin(115200);
  delay(2000);
  Serial.println("JAH POOL VALVES BOARD July 2020");
  registerMap[0] = 254;
  registerMap[1] = 0;
  registerMap[2] = 0;
  for (byte i = 0; i < 8; i = i + 1) {
    pinMode(outputPins[i], OUTPUT);
    digitalWrite(outputPins[i], LOW);
  }
  for (byte i = 0; i < 4; i = i + 1) {
    pinMode(analogPin[i], INPUT);
  }

  // Start up the library
  sensors.begin();
  thermometerCount = sensors.getDeviceCount();
  Serial.print("1 Wire Device Count is ");
  Serial.println(thermometerCount);
  for (byte i = 0; i < thermometerCount; i++) {
    if (!sensors.getAddress(thermometer[i], i)) {
      Serial.print("Unable to find address for Device ");
      Serial.println(i);
    }
  }
  
  Wire.begin(SLAVE_ADDRESS);
  Wire.onRequest(requestEvent);
  Wire.onReceive(receiveEvent);
  
}

void requestTemps() {
  sensors.requestTemperatures();
}

// function to print the temperature for a device
void printTemperature(byte i)
{
  float tempC = sensors.getTempC(thermometer[i]);
  if(tempC == DEVICE_DISCONNECTED_C) 
  {
    Serial.println("Error: Could not read temperature data");
    return;
  }
  int tempCi = (int) tempC;
  byte decimal = 0;
  if (tempC - tempCi > 0) {
    decimal = (tempC - tempCi) * 100;
  } else {
    decimal = (tempCi - tempC) * 100;
  }
  byte high = highByte(tempCi);
  byte low = lowByte(tempCi);
  Serial.print("Temp C: ");
  Serial.print(tempC);  
  Serial.print(" intC: ");
  Serial.print(tempCi);
  Serial.print(" high: ");
  Serial.print(high);
  Serial.print(" low: ");
  Serial.print(low);
  Serial.print(" decimal: ");
  Serial.println(decimal);

}

// function to send the temperature for a device
void sendTemperature(byte i)
{
  float tempC = sensors.getTempC(thermometer[i]);
  int tempCi = (int) tempC;
  byte decimal = 0;
  if (tempC - tempCi > 0) {
    decimal = (tempC - tempCi) * 100;
  } else {
    decimal = (tempCi - tempC) * 100;
  }
  byte high = highByte(tempCi);
  byte low = lowByte(tempCi);
  registerMap[3] = i;
  registerMap[4] = high;
  registerMap[5] = low;
  registerMap[6] = decimal;
  registerMap[0] = 248;  
}

void readAdc(byte i) {
  analogValues[i] = analogRead(i);
  registerMap[3] = i;
  registerMap[4] = highByte(analogValues[i]);
  registerMap[5] = lowByte(analogValues[i]);
  registerMap[0] = 238;
}


void getTemp()
{
  // The internal temperature has to be used
  // with the internal reference of 1.1V.
  // Channel 8 can not be selected with
  // the analogRead function yet.
  // Set the internal reference and mux.
  ADMUX = _BV(REFS1) | _BV(REFS0) | _BV(MUX3);
  delay(20);            // wait for voltages to become stable.
  ADCSRA |= _BV(ADEN) | _BV(ADSC);  // Start the ADC
  // Detect end-of-conversion
  while (bit_is_set(ADCSRA,ADSC));
 
  int value = ADCW;
  Serial.print("Get Temp ADC value is: ");
  Serial.println(value);
  registerMap[4] = lowByte(value);
  registerMap[3] = highByte(value);
  registerMap[0] = 211;
  // The offset for degree C.
  //t = result - 245;
}

void getVcc() {
  // Read 1.1V reference against AVcc
  // set the reference to Vcc and the measurement to the internal 1.1V reference
  ADMUX = _BV(REFS0) | _BV(MUX3) | _BV(MUX2) | _BV(MUX1);
  
  delay(20); // Wait for Vref to settle
  ADCSRA |= _BV(ADSC); // Start conversion
  while (bit_is_set(ADCSRA,ADSC)); // measuring

  int value = ADCW;
  Serial.print("Get Vcc value is: ");
  Serial.println(value);
  registerMap[4] = lowByte(value);
  registerMap[3] = highByte(value);
  registerMap[0] = 210;

  //result = 1110576L / result; // Calculate Vcc (in mV); 1125300 = 1.1*1023*1000
  //return result; // Vcc in millivolts
}


void requestEvent() {
  Serial.print("Sending Data rM[0] is ");
  Serial.println(registerMap[0]);
  if (registerMap[0] == 238) { //adc value ready
    Wire.write(registerMap, 6);
    registerMap[1] = 231;
  } else if (registerMap[0] == 249) { //count ready
    Wire.write(registerMap, 4);
    registerMap[1] = 249;
  } else if (registerMap[0] == 248) { //temp value ready
    Wire.write(registerMap, 7);
    registerMap[1] = 248;
  } else if (registerMap[0] == 210) { //VCC value ready
    Wire.write(registerMap, 5);
    registerMap[1] = 210;
  } else if (registerMap[0] == 211) { //Core temp value ready
    Wire.write(registerMap, 5);
    registerMap[1] = 211;
  } else {
    Wire.write(registerMap, REG_MAP_SIZE);  //Set the buffer up to send whole buffer
    registerMap[1] = 254;
  }
}

// read commands.
void receiveEvent(int bytesReceived) {
  for (int a = 0; a < bytesReceived; a++) {
    if ( a < MAX_SENT_BYTES) {
      registerMap[0] = 251;
      receivedCommands[a] = Wire.read();
    } else {
      registerMap[0] = 252;
      Wire.read();  // if we receive more data then allowed just throw it away
    }
  }
  Serial.print("Received Data rC[0] is ");
  Serial.println(receivedCommands[0]);
  if (receivedCommands[0] == 249) {
     registerMap[3] = thermometerCount;
     registerMap[0] = 249;
  }
  if (receivedCommands[0] > 239 && receivedCommands[0] < 248) {
    byte i = receivedCommands[0] - 240;
    requestTemps();
    sendTemperature(i);
  }
  if (receivedCommands[0] > 229 && receivedCommands[0] < 234) {
    byte i = receivedCommands[0] - 230;
    readAdc(i);
  }
  if (receivedCommands[0] == 210) {
    getVcc();
  }
  if (receivedCommands[0] == 211) {
     getTemp();
  }
  if (receivedCommands[0] > 219 && receivedCommands[0] < 224) {
    relayStarter((receivedCommands[0] - 220), receivedCommands[1], ((receivedCommands[2] << 8) | receivedCommands[3]));
  }
  if (receivedCommands[0] > 223 && receivedCommands[0] < 228) {
    byte i = receivedCommands[0] - 224;
    relayTime[i] = millis();
  }
}

void relayStarter(byte i, byte pin, int timeValue) {
  if (relayOn[i] == 1) {
    registerMap[0] = 228;
    registerMap[3] = i + 220;
    return;
  }
  //relayTime, relayPin, relayOn
  relayTime[i] = millis() + timeValue;
  relayPin[i] = (i * 2) + pin;
  relayOn[i] = 1;
  digitalWrite(outputPins[relayPin[i]], HIGH);
  bitSet(registerMap[2], i);
  registerMap[0] = i + 220;
  Serial.print("Valve Time is ");
  Serial.println(timeValue);    
}

void loop() {
  // put your main code here, to run repeatedly:
  currentMillis = millis();
  if (relayOn[0] == 1) {
    if (relayTime[0] < currentMillis) {
        digitalWrite(outputPins[relayPin[0]], LOW);
        relayOn[0] = 0;
        registerMap[0] = 229;
        bitClear(registerMap[2], 0);
        registerMap[3] = 220;
    }
  }
  if (relayOn[1] == 1) {
    if (relayTime[1] < currentMillis) {
        digitalWrite(outputPins[relayPin[1]], LOW);
        relayOn[1] = 0;
        registerMap[0] = 229;
        bitClear(registerMap[2], 1);
        registerMap[3] = 221;
    }    
  }
  if (relayOn[2] == 1) {
    if (relayTime[2] < currentMillis) {
        digitalWrite(outputPins[relayPin[2]], LOW);
        relayOn[2] = 0;
        registerMap[0] = 229;
        bitClear(registerMap[2], 2);
        registerMap[3] = 222;
    }    
  }
  if (relayOn[3] == 1) {
    if (relayTime[3] < currentMillis) {
        digitalWrite(outputPins[relayPin[3]], LOW);
        relayOn[3] = 0;
        registerMap[0] = 229;
        bitClear(registerMap[2], 3);
        registerMap[3] = 223;
    }    
  }

}
