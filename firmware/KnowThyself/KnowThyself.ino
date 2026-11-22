#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include "secrets.h"

MAX30105 sensor;
uint32_t ir[100], red[100];
uint8_t indexInWindow = 0;

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  if (!sensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30102 not found. Check the breakout and I2C wiring.");
    while (true) delay(1000);
  }
  sensor.setup(60, 4, 2, 100, 411, 4096);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void loop() {
  sensor.check();
  while (sensor.available()) {
    ir[indexInWindow] = sensor.getFIFOIR();
    red[indexInWindow++] = sensor.getFIFORed();
    sensor.nextSample();
    if (indexInWindow < 100) continue;
    indexInWindow = 0;
    int32_t bpm, spo2;
    int8_t validBpm, validSpo2;
    maxim_heart_rate_and_oxygen_saturation(ir, 100, red, &spo2, &validSpo2, &bpm, &validBpm);
    if (!validBpm || bpm <= 0 || bpm > 255) {
      Serial.println("Window rejected by estimator");
      continue;
    }
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Waiting for Wi-Fi");
      continue;
    }
    char body[96], oxygen[10];
    if (validSpo2 && spo2 >= 0 && spo2 <= 100) snprintf(oxygen,sizeof oxygen,"%ld",(long)spo2);
    else snprintf(oxygen,sizeof oxygen,"null");
    snprintf(body,sizeof body,"{\"quality\":\"valid\",\"bpm\":%ld,\"spo2\":%s}",(long)bpm,oxygen);
    WiFiClient client;
    HTTPClient request;
    request.setConnectTimeout(500);
    request.setTimeout(500);
    if (request.begin(client, RECEIVER_URL)) {
      request.addHeader("Content-Type","application/json");
      request.addHeader("Authorization",String("Bearer ") + RECEIVER_TOKEN);
      Serial.printf("Receiver status: %d\n",request.POST(body));
      request.end();
      // HTTP can interrupt sampling. Discard queued samples to start a fresh window.
      sensor.check();
      while (sensor.available()) sensor.nextSample();
      sensor.clearFIFO();
    }
  }
  delay(4);
}
