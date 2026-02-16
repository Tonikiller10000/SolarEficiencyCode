
    class ShellyAP {
        constructor() {
            this.ssid = "";
            this.type = "unknown";
            this.status = "available";
            this.rssi = 0;
        }
    }
    class Shelly {
        constructor() {
            this.ID = "-1";
            this.name = "";
            this.ssid = "";
            this.type = "";

            // Relay Data
            this.state = false;
            this.overcurrent = false;
            this.voltage = 0.0;
            this.current = 0.0;
            this.power = 0.0;
            this.energy = 0.0;
            this.startup_state = "last";

            // T&H Data
            this.USB_powered = false;
            this.vbat = 0.0;
            this.bat = 0.0;
            this.temp = 0.0;
            this.humidity = 0.0;
        }
    }
    class Rule {
        constructor() {
            this.time1 = "00:00";
            this.time2 = "00:00";
            this.relayName = ""; 
            this.sensorName = "";
            
            this.tMin = 0.0;
            this.tMax = 0.0;
            this.hMin = 0.0;
            this.hMax = 0.0;

            this.enRule = false;
            this.enTemp = true;
            this.enHum = false;
            this.enTime = false;

            this.action = "NOTHING"; 
            this.otherwise = "NOTHING"; 
        }
    }
    let connectedDevs = []; 
    let rulesList = [];  
    let scanList = []; 
    let temperatureUnit = 'C';
    let ruleTotalNr = 1;
    let showDebugPanel = false;
    let showFilePanel = false;
    let availableLogFiles = []; 
    let availableMonthlyFiles = [];

    function tab(n) {// select the tab and update the stats tab when seleted
        ['scan', 'devices', 'program', 'stats'].forEach(t => {
            document.getElementById('tab-' + t).classList.add('hidden');
            document.querySelectorAll('.nav-btn').forEach(b => { if (b.innerText.toLowerCase() === t) b.classList.remove('active'); });
        });
        document.getElementById('tab-' + n).classList.remove('hidden');
        event.currentTarget.classList.add('active');

        if (n === 'stats') {
            fetchLogFiles();
            updateStatsDropdowns(); // Init dropdowns
            generateChart();        // Init chart

            // Restore debug/file panel state
            applyPanelVisibility();
        }
    }
    function toggleView(id) {// makes the device row switch between settings mode and normanl mode
        let row = document.getElementById('row-' + id);
        let settings = document.getElementById('settings-' + id);

        if (row && settings) {
            row.classList.toggle('hidden');
            settings.classList.toggle('hidden');
        } 
        else 
            console.error("Could not find elements for ID:", id);
        
    }
    function acction(acc_id=0, acc_p1='', acc_p2='') {
        let id, el = null;
        if(typeof acc_id === 'number' || (typeof acc_id === 'string' && !isNaN(acc_id))) id = parseInt(acc_id);
        else {
            el = acc_id;
            const owner = el.closest('[data-id]');
            if (!owner) {
                console.error('No data-id found for action', acc_p1, acc_p2);
                return;
            }
            id = parseInt(owner.dataset.id);
        }

        if(acc_p1 === 'device_list' && acc_p2 === 'rename_row') {
            const input = document.getElementById(`name-in-${id}`);
            if (!input || !input.value.trim()) return;

            const newName = input.value.trim();
            document.getElementById(`disp-name-${id}`).innerText = newName;
            input.placeholder = newName;
            input.value = "";
            connectedDevs[id].name = newName;
            fetch(`/update_website?devpage=${JSON.stringify({ id, acction: "rename", name: newName })}`);
        }
        if(acc_p1 === 'device_list' && acc_p2 === 'toggle_row') {
            el.classList.toggle('on');
            const state = el.classList.contains('on');
            fetch(`/update_website?devpage=${JSON.stringify({ id, acction: "toggle", relayStateON: state })}`);
        }
        if(acc_p1 === 'device_list' && acc_p2 === 'disconnect_row') {
            if(confirm("Are you sure you want to disconnect this device?")) {
                connectedDevs.splice(id, 1);
                fetch(`/update_website?devpage=${JSON.stringify({ id, acction: "disconnect" })}`);
                acction(0, 'device_list', 'update');
            }
        }
        if(acc_p1 === 'scan_list' && acc_p2 === 'toggle_row'){
            const btn = document.querySelectorAll('#tab-scan .status-btn')[id];
            const dev = scanList[id]; 
            if(!dev || !btn) return;
            if(dev.status === 'available') {
                // --- CONNECT LOGIC ---
                btn.innerText = "Connecting...";
                btn.disabled = true; // Lock button
                btn.style.opacity = "0.7";
                fetch(`/update_website?scanpage=${JSON.stringify({scan: false, row: id, status: dev.status})}`);
                
                setTimeout(() => {
                    dev.status = 'connected';
                    acction(0, 'scan_list', 'update'); // Refresh UI to show 'CONNECTED' state
                }, 5000); 
            }
            else {
                // --- DISCONNECT LOGIC ---
                btn.innerText = "Disconnecting...";
                btn.disabled = true;
                btn.style.opacity = "0.7";
                fetch(`/update_website?scanpage=${JSON.stringify({scan: false, row: id, status: 'connected'})}`);

                setTimeout(() => {
                    dev.status = 'available';
                    acction(0, 'scan_list', 'update'); // Refresh UI to show 'Connect' state
                }, 1000);
            }
        }
        if(acc_p1 === 'rules_row' && acc_p2 === 'delete') {
            const row = el.closest('[data-id]');
            const list = document.getElementById('prog-list');
            const idToDelete = parseInt(row.dataset.id);

            if (rulesList.length > 1) {
                rulesList.splice(idToDelete, 1); 
                ruleTotalNr--;
                acction(0, 'rules_list', 'update');
                fetch(`/update_website?programpage=${JSON.stringify({ idToDelete, acction: "remove" })}`);
            }
            
        }
        if(acc_p1 === 'rules_row' && acc_p2 === 'add'){// add a new rule 
            let newRule = new Rule();
            rulesList.push(newRule);
            ruleTotalNr++;
            acction(0, 'rules_list', 'update');//update to show the new row
            fetch(`/update_website?programpage={"id":0, "acction":"add"}`);
        }
        if(acc_p1 === 'rules_list' && acc_p2 === 'update'){// display the rules list
            // clear rules
            const list = document.getElementById('prog-list');
            
            
            
            list.innerHTML = ""; 

            let relayOpts = '<option value="">None</option>';
            let sensorOpts = '<option value="">None</option>';
            // update options
            connectedDevs.forEach(dev => {
                if (dev.type.toLowerCase().includes("relay")) 
                    relayOpts += `<option value="${dev.name}">${dev.name}</option>`;
                if (dev.type.includes("H&T") || dev.type.includes("Sensor")) 
                    sensorOpts += `<option value="${dev.name}">${dev.name}</option>`;
            });
            // Build Rows
            rulesList.forEach((rule, index) => {
                const div = document.createElement('div');
                div.className = "device-card prog-row";
                div.dataset.id = index;

                div.innerHTML = `
                    <div class="prog-col"><input type="checkbox" class="rule-en" ${rule.enRule ? 'checked' : ''}></div>
                    
                    <div class="prog-col" data-type="temp">
                        <div class="prog-sub"><input type="checkbox" class="cat-en" ${rule.enTemp ? 'checked' : ''}> Temperature</div>
                        <div class="prog-sub">
                            <div style="display:flex; gap:5px; align-items:center">
                                <div class="input-wrapper"><span class="input-lbl">MIN</span><input class="prog-in" value="${rule.tMin > 9000 ? "" : rule.tMin}"></div>
                                <div class="input-wrapper"><span class="input-lbl">MAX</span><input class="prog-in" value="${rule.tMax > 9000 ? "" : rule.tMax}"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="prog-col" data-type="hum">
                        <div class="prog-sub"><input type="checkbox" class="cat-en" ${rule.enHum ? 'checked' : ''}> Humidity</div>
                        <div class="prog-sub">
                            <input class="prog-in" value="${rule.hMin > 9000 ? "" : rule.hMin}"> <input class="prog-in" value="${rule.hMax > 9000 ? "" : rule.hMax}">
                        </div>
                    </div>
                    
                    <div class="prog-col" data-type="time">
                        <div class="prog-sub"><input type="checkbox" class="cat-en" ${rule.enTime ? 'checked' : ''}> Time (24h)</div>
                        <div class="prog-sub">
                            <input class="prog-in" value="${rule.time1 === "99:99" ? "" : rule.time1}" style="width:55px"> <b style="color:#000">-</b> <input class="prog-in" value="${rule.time2=== "99:99" ? "" : rule.time2}" style="width:55px">
                        </div>
                    </div>

                    <div class="prog-col">
                        <span class="label-xs">SENSOR</span>
                        <select class="sensor-sel">${sensorOpts}</select>
                    </div>

                    <div class="prog-col">
                        <span class="label-xs">RELAY</span>
                        <select class="relay-sel">${relayOpts}</select>
                    </div>

                    <div class="prog-col">
                        <span class="label-xs">ACTION</span>
                        <select class="action-sel">
                            <option value="ON" ${rule.action === 'ON' ? 'selected' : ''}>ON</option>
                            <option value="OFF" ${rule.action === 'OFF' ? 'selected' : ''}>OFF</option>
                            <option value="TOGGLE" ${rule.action === 'TOGGLE' ? 'selected' : ''}>TOGGLE</option>
                            <option value="NOTHING" ${rule.action === 'NOTHING' ? 'selected' : ''}>NOTHING</option>
                        </select>
                    </div>

                    <div class="prog-col">
                        <span class="label-xs">OTHERWISE</span>
                        <select class="action-sel">
                            <option value="NOTHING" ${rule.otherwise === 'NOTHING' ? 'selected' : ''}>NOTHING</option>
                            <option value="ON" ${rule.otherwise === 'ON' ? 'selected' : ''}>ON</option>
                            <option value="OFF" ${rule.otherwise === 'OFF' ? 'selected' : ''}>OFF</option>
                            <option value="TOGGLE" ${rule.otherwise === 'TOGGLE' ? 'selected' : ''}>TOGGLE</option>
                        </select>
                    </div>

                    <button class="btn-del" onclick="acction(this, 'rules_row', 'delete')"><i class="fas fa-times"></i></button>
                `;

                div.querySelector('.relay-sel').value = rule.relayName || "";
                div.querySelector('.sensor-sel').value = rule.sensorName || "";
                
                div.querySelectorAll('.action-sel').forEach(s =>{
                    s.className = 'action-sel';
                    if(s.value === 'ON') s.style.backgroundColor = '#2ecc71';
                    if(s.value === 'OFF') s.style.backgroundColor = '#e74c3c';
                    if(s.value === 'NOTHING') s.style.backgroundColor = '#95a5a6'; 
                    if(s.value === 'TOGGLE') s.style.backgroundColor = '#73c3c9ff';  
                });

                list.appendChild(div);
            });
        }
        if(acc_p1 === 'stats_list' && acc_p2 === 'update'){// display the stats list

            const list = document.getElementById('stats-sensor-list');
            list.innerHTML = "";

    

            connectedDevs.forEach(s => {
                if (s.type !== 'H&T') return;
                const div = document.createElement('div');
                div.className = "device-card stats-row";
                div.style.height = "50px";
                div.innerHTML = `
                                <div style="line-height:1.2"><b>${s.name}</b><br><small style="color:#bdc3c7; font-size:0.6rem">${s.ssid}</small></div>
                                <div style="color:#7f8c8d; font-size:0.8rem">${s.type}</div>
                                <div style="text-align:right; font-weight:bold">${s.val}</div>
                            `;
                list.appendChild(div);
            });

        }
        if(acc_p1 === 'scan_list' && acc_p2 === 'update'){//display scanned devices data
            document.getElementById('found-nr').innerText = scanList.length;
            let container = document.getElementById('tab-scan');
            container.querySelectorAll('.scan-row').forEach(row => row.remove());
            scanList.forEach((dev, index) => {
                let row = document.createElement('div');
                row.className = "device-card scan-row";
                let btnClass = (dev.status === 'connected') ? 'conn' : 'avail';
                row.innerHTML = `
                    <div class="scan-info"><span>${index + 1}</span><span>${dev.ssid}</span><span>${dev.type}</span><span>${dev.rssi}</span></div>
                    <button class="status-btn ${btnClass}" onclick="acction(${index}, 'scan_list', 'toggle_row')"><span>${dev.status}</span></button>
                `;
                container.appendChild(row);
            });
        }
        if(acc_p1 === 'device_list' && acc_p2 === 'update'){// display the devices list
            const container = document.getElementById('tab-devices');
            container.innerHTML = ""; 

            connectedDevs.forEach((dev, index) => {
                let row = "";
                let isOn = dev.state ? 'on' : '';
                // ======================= RELAY TYPE =======================
                if (dev.type === 'Relay') {
                    row = `
                        <div class="device-card" id="row-${index}" data-id="${index}">
                            <button class="sq-btn btn-side ${dev.state}" onclick="acction(this, 'device_list', 'toggle_row')"><i class="fas fa-power-off"></i></button>
                            <div class="content-area">
                                <span class="dev-name" id="disp-name-${index}">${dev.name || 'Relay ' + (index+1)}</span>
                                <div class="dev-data">
                                    <span><span id="p-val-${index}">${dev.power}</span><span class="unit">W</span></span>
                                    <span><span id="v-val-${index}">${dev.voltage}</span><span class="unit">V</span></span>
                                </div>
                            </div>
                            <button class="sq-btn btn-settings" onclick="toggleView(${index})"><i class="fas fa-cog"></i></button>
                        </div>

                        <div class="device-card hidden" id="settings-${index}" data-id="${index}">
                            <div class="settings-main">
                                <div class="row-top">
                                    <input type="text" id="name-in-${index}" placeholder="${dev.name}" maxlength="16">
                                    <button class="btn-ok" onclick="acction(this, 'device_list', 'rename_row')">OK</button>
                                </div>
                                <div class="row-bot">
                                    <button class="btn-dis" onclick="acction(this, 'sys', 'disconnect')">Disconnect</button>
                                    <span>ID: ${dev.ID} | SSID: ${dev.ssid}</span>
                                    <div style="margin-left:auto">
                                        <span class="label-xs">STARTUP</span> 
                                        <select onchange="fetch('/relay?id=${index}&startup='+this.value)"><option>last</option><option>on</option><option>off</option></select>
                                    </div>
                                </div>
                            </div>
                            <button class="sq-btn btn-settings active" onclick="toggleView(${index})"><i class="fas fa-cog"></i></button>
                        </div>
                    `;
                }// ======================= H&T TYPE =======================
                else if (dev.type === 'H&T' || dev.type === 'Sensor') {
                    row = `
                    <div class="device-card" id="row-${index}" data-id="${index}">
                        <div class="sq-btn btn-side red"><i class="fas fa-thermometer-half"></i></div>
                        <div class="content-area">
                            <span class="dev-name" id="disp-name-${index}">${dev.name || 'Sensor ' + (index+1)}</span>
                            <div class="dev-data">
                                <span><span id="t-val-${index}">${dev.temp}</span><span class="unit">°C</span></span>
                                <span><span id="h-val-${index}">${dev.humidity}</span><span class="unit">%</span></span>
                            </div>
                        </div>
                        <div class="bat-status"><i class="fas fa-battery-three-quarters"></i> ${dev.bat}%</div> 
                        <button class="sq-btn btn-settings" onclick="toggleView(${index})"><i class="fas fa-cog"></i></button>
                    </div>

                    <div class="device-card hidden" id="settings-${index}" data-id="${index}">
                        <div class="settings-main">
                            <div class="row-top">
                                <input type="text" id="name-in-${index}" placeholder="${dev.name}" maxlength="16">
                                <button class="btn-ok" onclick="acction(this, 'rename', 'save')">OK</button>
                                <div class="display-cfg-box" style="margin-left:auto">
                                    <span class="label-xs" style="text-align:center; border-bottom:1px solid #ddd">DISPLAY OPTIONS</span>
                                    <div class="sensor-cfg">
                                        <span class="label-xs">BIG</span><select><option>Temp</option><option>Hum</option></select>
                                        <span class="label-xs">SMALL</span><select><option>Hum</option><option>Bat</option><option>None</option></select>
                                        <span class="label-xs">UNIT</span><select><option>C</option><option>F</option></select>
                                    </div>
                                </div>
                                
                                <div style="display:flex; align-items:center; gap:5px">
                                    <span class="label-xs" style="text-align:right">POWER<br>SOURCE</span>
                                    <div class="bat-sq" onclick="this.innerHTML=this.innerHTML.includes('battery')?'<i class=\\'fas fa-plug\\'></i>':'<i class=\\'fas fa-battery-three-quarters\\'></i>'"><i class="fas fa-battery-three-quarters"></i></div>
                                </div>
                            </div>
                            <div class="row-bot">
                                <button class="btn-dis" onclick="acction(this, 'sys', 'disconnect')">Disconnect</button>
                                <span>ID: ${dev.ID} | SSID: ${dev.ssid}</span>
                            </div>
                        </div>
                        <button class="sq-btn btn-settings active" onclick="toggleView(${index})"><i class="fas fa-cog"></i></button>
                    </div>
                    `;
                }
                container.insertAdjacentHTML('beforeend', row);
            });
        }
        if(acc_p1 === 'esp' && acc_p2 === 'update_devices'){ // update the device data from esp
            fetch('/update_devices').then(r => r.json()).then(d => {
                if(d.esp_temp1 !== undefined) document.getElementById('esp-t1').innerText = parseFloat(d.esp_temp1).toFixed(1) + "\u00B0C";
                if(d.esp_temp2 !== undefined) document.getElementById('esp-t2').innerText = parseFloat(d.esp_temp2).toFixed(1) + "\u00B0C";
                if(d.esp_temp3 !== undefined) document.getElementById('esp-t3').innerText = parseFloat(d.esp_temp3).toFixed(1) + "\u00B0C";

                connectedDevs = d.Connected_devices.map(data => Object.assign(new Shelly(), data));
            
                const container = document.getElementById('tab-devices');
                if (container.querySelectorAll('.device-card:not(.hidden)').length !== connectedDevs.length) {
                    acction(0, 'device_list', 'update'); 
                }else {
                    // Update values only
                    connectedDevs.forEach((dev, i) => {
                        let pVal = document.getElementById(`p-val-${i}`);
                        let vVal = document.getElementById(`v-val-${i}`);
                        let tVal = document.getElementById(`t-val-${i}`);
                        let hVal = document.getElementById(`h-val-${i}`);
                        
                        if(pVal) pVal.innerText = dev.power;
                        if(vVal) vVal.innerText = dev.voltage;
                        if(tVal) tVal.innerText = dev.temp;
                        if(hVal) hVal.innerText = dev.hum;
                    });
                }

            }).catch(e => console.log("Measurements request error!", e));
        }
        if(acc_p1 === 'esp' && acc_p2 === 'load_scan'){ 
            fetch(`/update_website?load=${JSON.stringify({section: "scan_list"})}`).then(response => response.json()) .then(d => { 
                    if (d && d.devices) scanList = d.devices.map(data => Object.assign(new ShellyAP(), data));
                    acction(0, 'scan_list', 'update'); // Update the UI with the new list 
                })
                .catch(err => console.error("Error loading startup scan:", err));
        }
        if(acc_p1 === 'esp' && acc_p2 === 'update_scan'){ 
            // Prevent spamming
            const btn = document.querySelector('.btn-refresh');
            if(btn.disabled) return; 
            btn.disabled = true; 
 
            scanList = [];
            document.getElementById('found-nr').innerText = "0";
            const container = document.getElementById('tab-scan');

            fetch(`/update_website?scanpage=${JSON.stringify({scan: true, row: -1, status: ""})}`)
            .catch(e => console.log("Ignored connection error (expected)")) 
            .finally(() => {
                console.log("Scanning...  waiting 5s");

                setTimeout(() => { fetch('/update_scannedDevices').then(r => r.json()).then(d => {
                        if(loader.parentNode) loader.remove(); // Remove loader
                        btn.disabled = false; // Unlock button
                        if (d.devices) scanList = d.devices.map(data => Object.assign(new ShellyAP(), data));
                        acction(0, 'scan_list', 'update');
                    });
                }, 6500); 
            });



            container.querySelectorAll('.scan-row').forEach(row => row.remove()); // Remove old rows
            // Show loading
            // Create Countdown Loader
            let timeLeft = 6;
            let loader = document.createElement('div');
            loader.className = "scan-row scanning-msg"; 
            loader.innerText = `Scanning... ${timeLeft}s`;
            container.appendChild(loader);

            // Timer Loop
            let timer = setInterval(() => {
                timeLeft--;
                loader.innerText = `Scanning... ${timeLeft}s`;
                if(timeLeft <= 0) clearInterval(timer);
            }, 1000);
        }
        if(acc_p1 === 'esp' && acc_p2 === 'update_rules'){ // update the rules list from esp
            fetch('/update_rules').then(r => r.json()).then(d => {
                rulesList = [];
                ruleTotalNr = d.count;
                if (d.rules) 
                    rulesList = d.rules.map(data => Object.assign(new Rule(), data));
            }).catch(e => console.log("Rules request error!", e));
        }
        if(acc_p1 === 'esp' && acc_p2 === 'cmd'){ // send command to esp
            const inputEl = document.getElementById('cmd-in');
            const cmdVal = inputEl.value.trim();
            if(!cmdVal) return;

            // --- LOCAL INTERCEPTION ---
            if(cmdVal === "show files true") {
                document.getElementById('extra-panels').classList.remove('hidden');
                document.getElementById('files-box').classList.remove('hidden');
                updateFileList(); // Call file fetcher
                showFilePanel = true;
                inputEl.value = "";
                applyPanelVisibility();
                return; // STOP here, don't send to ESP
            }
            if(cmdVal === "show files false") {
                document.getElementById('files-box').classList.add('hidden');
                showFilePanel = false;
                inputEl.value = "";
                applyPanelVisibility();
                return; 
            }
            if(cmdVal === "debug on") {
                document.getElementById('extra-panels').classList.remove('hidden');
                document.getElementById('console-box').classList.remove('hidden');
                showDebugPanel = true;
                const consoleDiv = document.getElementById('console-output'); 
                if (consoleDiv) {
                    const helpMsg = document.createElement('div'); 
                    helpMsg.style.color = "#3498db"; 
                    helpMsg.style.fontWeight = "bold";
                    helpMsg.innerText = "> Debug mode enabled. Use command \"help\" to show possible commands"; 
                    consoleDiv.appendChild(helpMsg); 
                    consoleDiv.scrollTop = consoleDiv.scrollHeight; // Ensure it scrolls into view 
                }
                applyPanelVisibility();
            }
            if(cmdVal === "debug off") {
                document.getElementById('console-box').classList.add('hidden'); 
                showDebugPanel = false;
                applyPanelVisibility();
            }
            
            // send command if it isn`t local
            fetch(`/update_website?statpage=${encodeURIComponent(JSON.stringify({cmd: cmdVal}))}`);
            inputEl.value = "";
            applyPanelVisibility();
        }
    }

    function generateChart() {
        const devSel = document.getElementById('graph-device');
        const timeSel = document.getElementById('graph-time');
        const ctx = document.getElementById('myChart').getContext('2d');
        
        if (window.myChartInstance) window.myChartInstance.destroy();
        const selectedFile = timeSel.value;
        const selectedDevice = devSel.options[devSel.selectedIndex].text;
        let data1 = [], data2 = [];

        // Identify Device Type
        let deviceType = "unknown";
        let deviceIndex = -1;

        if (devSel.value.startsWith("esp_temp")) deviceType = "ESP_temp";
        else{
            for (let i = 0; i < connectedDevs.length; i++) {
                if (connectedDevs[i].name === devSel.options[devSel.selectedIndex].text) {
                    deviceIndex = i;
                    deviceType = connectedDevs[i].type;
                    break;
                }
            }
        }

        // Identify file Type
        let period = "";
        let filename1 = timeSel;
        if (timeSel.includes('.csv')) period = "m";
        if (timeSel.includes('.txt')) period = "d";

        if(period === "d"){
            filename1 = "logs/" + filename1;
            if(deviceType === "esp_temp")
                data1 = parseLogFile(fileName1, devSel.value, 1);
            if(deviceType === "H&T"){
                data1 = parseLogFile(fileName1, devSel.value, 1);
                data2 = parseLogFile(fileName1, devSel.value, 2);
            }
            if(deviceType === "Relay")
                data1 = parseLogFile(fileName1, devSel.value, 4);



        }




        window.myChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({length: 24}, (_, i) => `${i}:00`),
                datasets: [
                    {
                        label: `${devSel.options[devSel.selectedIndex].text} - ${typeSel.value.toUpperCase()}`,
                        data: data1.map(v => v === -9999.0 ? null : v),
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 2,
                        yAxisID: deviceType,
                        spanGaps: true
                    },
                    {
                        // Only adds second dataset if data2 has content (e.g., for H&T)
                        label: `${selectedDevice} - Secondary`,
                        data: data2.map(v => v === -9999.0 ? null : v),
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 2,
                        yAxisID: 'y1', // Uses the right-side axis
                        spanGaps: false
                    }
                ].filter(ds => ds.data.some(v => v !== null)) // Only add dataset if it has real data
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                scales: { 
                    y: {
                        display: true, 
                        title: { display: true, text: 'Primary Value' }
                    },
                    y1: {
                        display: true, 
                        position: 'right', 
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Secondary Value' }
                    }
                }
            }
        });
    }




    async function parseLogFile(fileName, deviceName, valIdx) {
        const response = await fetch(`/get_data?data=${JSON.stringify({file: fileName})}`);
        const text = await response.text();
        const lines = text.split('\n');

        let hourlyData = new Array(24).fill(-9999.0);
        let hour = -1;

        for (let line of lines) {
            line = line.trim();
            if (line.startsWith("T:")) { hour++; continue; }
            if (hour > 23) break;
            if (line.startsWith(deviceName)) {
                const parts = line.split(',');
                // valIdx 1=Temp, 2=Hum (for Sensors) or 1=V,I,P,E (for Relays) 
                if (parts[valIdx] !== undefined) hourlyData[hour] = parseFloat(parts[valIdx]);  
            }
        }
        return hourlyData;
    }
    function updateStatsDropdowns() {
        const devSel = document.getElementById('graph-device');
        const timeSel = document.getElementById('graph-time');

        // generate deviced dropdown options
        let devHtml = '<option value="esp_temp1">esp_temp1</option><option value="esp_temp2">esp_temp1</option>';
        connectedDevs.forEach((d, i) => { devHtml += `<option value="${i}">${d.name}</option>`; });
        if (devSel.innerHTML !== devHtml) devSel.innerHTML = devHtml; // Only update if changed to avoid UI flickering

        // generate time periods dropdown options
        let timeHtml = '<option value="all">-none selected-</option>'; 
        availableLogFiles.forEach(f => {
            const match = f.match(/^(\d{4})(\d{2})(\d{2})\.txt$/);
            // Convert 20240101.txt -> 01/01/2024
            let name = match ? `${match[3]}/${match[2]}/${match[1]}` : f;
            timeHtml += `<option value="${f}">${name}</option>`;
        });
        availableMonthlyFiles.forEach(f => {
            timeHtml += `<option value="${f}">${f}</option>`;
        });

        if (timeSel.innerHTML !== timeHtml) timeSel.innerHTML = timeHtml;
    }
    function applyPanelVisibility() {
        const box = document.getElementById('extra-panels');
        const files = document.getElementById('files-box');
        const console = document.getElementById('console-box');

        if(showDebugPanel || showFilePanel) box.classList.remove('hidden');
        else box.classList.add('hidden');

        if(showFilePanel) files.classList.remove('hidden');
        else files.classList.add('hidden');

        if(showDebugPanel) console.classList.remove('hidden');
        else console.classList.add('hidden');
    }
    function updateFileList() {// asks for the display files
        fetch('/get_files').then(r => r.text()).then(html => {
            // Parse the HTML list returned by ESP to extract simpler links
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const links = tempDiv.querySelectorAll('a');
            let cleanHtml = "";
            links.forEach(link => {
                let fname = link.getAttribute('href');
                if (!fname.endsWith('.html') && !fname.endsWith('.css') && !fname.endsWith('.js')) {
                    cleanHtml += `<div style="cursor:pointer; color:#3498db; margin-bottom:2px" onclick="loadLogFile('${fname}')">${fname}</div>`;
                }
            });
            document.getElementById('file-list-content').innerHTML = cleanHtml;
        });
    }
    function fetchLogFiles() {// ask for the dropdown files
        fetch('/get_files').then(r => r.text()).then(html => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            // Extract log filenames
            availableLogFiles = Array.from(tempDiv.querySelectorAll('a'))
                .map(a => a.getAttribute('href'))
                .filter(f => f.match(/\/logs\/\d{8}\.txt/))
                .sort().reverse(); // Newest first
            
            // Extract sumaries filenames
            availableMonthlyFiles = Array.from(tempDiv.querySelectorAll('a'))
                .map(a => a.getAttribute('href'))
                .filter(f => f.includes('/sumaries/')) 
                .sort((a, b) => b.localeCompare(a)); // Sort alphabetically/date-wise descending    

            // Also update the visual file list panel if open
            const fileListDiv = document.getElementById('file-list-content');
            if(fileListDiv) fileListDiv.innerHTML = tempDiv.innerHTML; // Show all files in panel
            updateGraphOptions(); // Refresh graph dropdowns
        });
    }
    if (!!window.EventSource) {// Event Source for Console 
        var source = new EventSource('/events');
        source.addEventListener('console_log', function(e) {
            const consoleDiv = document.getElementById('console-output');
            // If the div is visible, append data
            if(consoleDiv && !consoleDiv.classList.contains('hidden')) {
                const span = document.createElement('div');
                span.innerText = "> " + e.data;
                consoleDiv.appendChild(span);
                consoleDiv.scrollTop = consoleDiv.scrollHeight; // Auto scroll
            }
        }, false);
    }



// rules tab event listener for error checking    
const container = document.getElementById('prog-list'); 
['change', 'click'].forEach(evt => 
    container.addEventListener(evt, (e) => {
        let el = e.target;
        
        if (evt === 'click' && (el.closest('.btn-ok') || el.type !== 'checkbox')) return; // Ignore "OK" buttons & non-checkbox clicks
        let row = el.closest('.prog-row');
        if (!row) return;
        let id = parseInt(row.dataset.id);
        let rule = rulesList[id]; 
        let payload = { id: id, acction: "update" }; // Default to update action
        let isValid = true; 
        let rangeError = false;

        if (el.classList.contains('prog-in')) {
            let parentCol = el.closest('.prog-col');
            let type = parentCol.dataset.type;
            let inputs = parentCol.querySelectorAll('.prog-in');
            let v1 = inputs[0].value.trim();
            let v2 = inputs[1].value.trim();

            // validation logic
            if (type === 'time') {

                if(v1 === "") v1 = "99:99";
                else if(!/^([01]\d|2[0-3]):?([0-5]\d)$/.test(v1)) isValid = false;
                if(v2 === "") v2 = "99:99";
                else if(!/^([01]\d|2[0-3]):?([0-5]\d)$/.test(v2)) isValid = false;

                inputs[0].classList.toggle('invalid', !isValid && v1 !== "99:99");
                inputs[1].classList.toggle('invalid', !isValid && v2 !== "99:99");
            } 
            else {
                let n1 = (v1 === "") ? 9999.0 : parseFloat(v1);
                let n2 = (v2 === "") ? 9999.0 : parseFloat(v2);
                if(v1 !== "" && isNaN(n1)) isValid = false;
                if(v2 !== "" && isNaN(n2)) isValid = false;

                if(isValid && n1 !== 9999.0 && n2 !== 9999.0 && n1 >= n2) isValid = false;
                v1 = n1; v2 = n2;
                inputs[0].classList.toggle('invalid', !isValid);
                inputs[1].classList.toggle('invalid', !isValid);
      
            }

            if (!isValid) return; // invalid input ... abort
            
            // update memory
            if (type === 'temp') { rule.tMin = parseFloat(v1); rule.tMax = parseFloat(v2); }
            if (type === 'hum')  { rule.hMin = parseFloat(v1); rule.hMax = parseFloat(v2); }
            if (type === 'time') { rule.time1 = v1; rule.time2 = v2; }
        }
        else if (el.classList.contains('rule-en')) {
            rule.enRule = el.checked;
            payload.acction = "rule_en";
            payload.value = rule.enRule;
        }
        else if (el.classList.contains('cat-en')) {
            const type = el.closest('.prog-col').dataset.type;
            if (type === 'temp') { rule.enTemp = el.checked; payload.acction = "temp_en"; payload.value = rule.enTemp; }
            if (type === 'hum')  { rule.enHum = el.checked;  payload.acction = "hum_en";  payload.value = rule.enHum; }
            if (type === 'time') { rule.enTime = el.checked; payload.acction = "time_en"; payload.value = rule.enTime; }
        }


        else if (el.classList.contains('sensor-sel')) rule.sensorName = el.value;
        else if (el.classList.contains('relay-sel')) rule.relayName = el.value;
        else if (el.classList.contains('action-sel')) {
            const allActions = row.querySelectorAll('.action-sel');
            if (el === allActions[0]) rule.action = el.value;
            else rule.otherwise = el.value;

            // Update Color
            if(el.value === 'ON') el.style.backgroundColor = '#2ecc71';
            else if(el.value === 'OFF') el.style.backgroundColor = '#e74c3c';
            else if(el.value === 'TOGGLE') el.style.backgroundColor = '#73c3c9ff'; 
            else el.style.backgroundColor = '#95a5a6'; 
        }
        else 
            return; // Clicked something unrelated


        // send payload
        if (payload.acction === "update") {
             payload.rule_time1 = rule.time1;
             payload.rule_time2 = rule.time2;
             payload.rule_selected_relay = rule.relayName;
             payload.rule_selected_sensor = rule.sensorName;
             payload.rule_tempMin = rule.tMin;
             payload.rule_tempMax = rule.tMax;
             payload.rule_humMin = rule.hMin;
             payload.rule_humMax = rule.hMax;
             payload.acction1 = rule.action;
             payload.acction2 = rule.otherwise;
        }

        console.log(`Valid data. Saving to ESP...`, payload);
        fetch(`/update_website?programpage=${JSON.stringify(payload)}`);
    })
);

// Startup
acction(0, 'esp', 'update_devices');
acction(0, 'esp', 'load_scan');
acction(0, 'esp', 'update_rules');


// stats tab time tracking
setInterval(() => { document.getElementById('st-time').innerText = new Date().toTimeString().split(' ')[0]; }, 100); 
// measurement data update
setInterval(() => { acction(0, 'esp', 'update_devices'); }, 1500); 
// makes log files downloadable
window.loadLogFile = function(fname) {window.open(fname, '_blank');}
// enable console to work with "ENTER"
document.getElementById("cmd-in").addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        event.preventDefault(); // Stop page refresh
        acction(0, 'esp', 'cmd');
    }
});





