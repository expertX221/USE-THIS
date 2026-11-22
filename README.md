# VOLTCTRL · The Consortium

wHACKiest 2026 · Know Thyself track. Bring together daily check-ins and a live heart-rate stream in a private dashboard. The rule-based insight agent compares next-day energy across two sleep-duration groups and shows the number of matched nights before offering an opt-in nudge.

## Run the demo

```sh
python3 server.py
```

Open http://localhost:8000 and select **Run simulated demo**. Enable habit nudges to see the suggestion. Demo readings and 14 synthetic check-ins are labeled, kept separate from personal check-ins, and generated locally. No account, cloud AI, key, credits or subscription is required. The agent uses deterministic statistics and templates. The pitch's Ollama integration is future work.

## Real data paths

- **Compatible BLE watch or chest strap.** On the watch enable heart-rate broadcasting, then open the dashboard in a Web Bluetooth-capable Chrome browser on HTTPS or localhost. Choose **Connect Bluetooth** and select the advertiser. The app subscribes to standard Heart Rate Measurement (0x2A37) under Heart Rate Service (0x180D). This route supplies pulse only. Some watches expose neither service to third-party clients. On Android, an HTTPS static deployment of the contents of `web/` can run the Bluetooth path entirely on the phone. No telemetry is uploaded by that path.
- **ESP32 over Wi-Fi.** Use `python3 server.py --lan` on an isolated private demo network. Configure **secrets.h** from the sample with your SSID, receiver LAN IP and printed token, and flash the sketch using Arduino IDE, the Espressif ESP32 board package and SparkFun MAX3010x Sensor Library. Connect the phone or laptop to the same Wi-Fi, open `http://LAPTOP_IP:8000`, enter the session token and choose **Connect ESP32 Wi-Fi**. Local HTTP exposes the token and readings to observers on that network, so keep LAN mode off public/shared Wi-Fi and use synthetic or explicitly consented readings during demos. The receiver won't listen outside localhost unless LAN mode is enabled.
## Fastrack Volt S1 on Android

Pair and sync in [Fastrack Smart World](https://play.google.com/store/apps/details?id=com.titan.fastrack.reflex). Its listing includes Volt S1 and advertises Google Fit synchronization, with feature availability varying by device. Standard BLE heart-rate broadcasting is unverified for this model. The watch's ability to pair with Smart World alone does not establish support.

If Google Fit sync is available, optionally enable it and check Fit for Volt S1 heart-rate entries. Google Fit also offers [Sync Fit with Health Connect](https://support.google.com/fit/answer/12830119), but verify which records appear and their source before relying on that path. VOLTCTRL does not read Health Connect or Google Fit directly in this build.

To use recorded watch pulse now, prepare a CSV in the dashboard's format using readings you can see or export. Open **Fastrack Volt S1 on Android** in the dashboard and select the file. The included sample is synthetic. Imports appear as historical readings, stay in the current browser session, and can be exported locally. The signal graph displays the latest 60. The **Connect BLE heart rate** button is for verified standard broadcasters. The ESP32 remains the live hardware route when the specific watch cannot broadcast.


## Circuit

[Open the exact four-wire wiring diagram](docs/circuit.svg). Connect GND to GND, GPIO21 to SDA, GPIO22 to SCL, and 3V3 to VIN **only if your specific breakout supports 3.3 V input and 3.3 V I²C**. Check its documentation before powering it. The sketch targets a classic ESP32 DevKit, not the ESP32-S3 simulation pinout. Pulse/SpO₂ are experimental wellness estimates. Estimator-rejected pulse windows are dropped. Invalid oxygen estimates are omitted.

[Editable Cirkit Designer reference](https://app.cirkitdesigner.com/project/9f4f0e04-907d-426a-8a01-067f8a4cd389). This public example has extra modules and different power wiring. Use the four-wire diagram above for our design. To recreate it in Cirkit Designer, make a blank project, select ESP32 DevKitC and MAX30102 from Diagramming Parts, and connect the labeled nets in the four-wire diagram. Optical sensor emulation was not verified. Use the replay in the dashboard when physical hardware is unavailable.

## Data ownership and limitations

Daily check-ins are browser-local. BLE samples live in the current page session. Wi-Fi samples live in local SQLite; the receiver shows and exports the latest 60 samples and removes records older than 24 hours on new ingestion. Disconnect stops the browser view. To stop the ESP32 from producing new records, disconnect or power down the board. Use **Clear local data** with the receiver token to remove stored readings. Keep your real data, database and firmware credentials out of the repository.

The sleep comparison uses a seven-hour split and a minimum of seven matched days with at least three in each group. That threshold is a demo heuristic. The two averages describe an association and may reflect other factors.
