//% block="Cuaderno"
//% color="#32a852"
//% icon="\uf02d"
namespace notebook {
    radio.setGroup(1);
    radio.setTransmitSerialNumber(true);

    interface Task {
        id: number;
        callback: () => void;
        interval: number;
        lastRun: number;
        repeat: boolean;
        active: boolean;
    }

    let tasks: Task[] = [];
    let nextTaskId = 0;

    function runTasks() {
        control.inBackground(() => {
            while (true) {
                let currentTime = input.runningTime();
                for (let task of tasks) {
                    if (task.active && currentTime >= task.lastRun + task.interval) {
                        task.callback();
                        task.lastRun = currentTime;
                        if (!task.repeat) {
                            task.active = false;
                        }
                    }
                }
                tasks = tasks.filter((t) => t.active);
                basic.pause(50);
            }
        });
    }

    function addTask(callback: () => void, delay: number, repeat: boolean): number {
        let task: Task = {
            id: nextTaskId++,
            callback: callback,
            interval: delay,
            lastRun: input.runningTime(),
            repeat: repeat,
            active: true,
        };
        tasks.push(task);
        return task.id;
    }

    function clearIntervalOrTimeout(taskId: number) {
        let task = tasks.find((t) => t.id === taskId);
        if (task) {
            task.active = false;
        }
    }

    function setInterval(callback: () => void, delay = 0): number {
        return addTask(callback, delay, true);
    }

    function setTimeout(callback: () => void, delay = 0): number {
        return addTask(callback, delay, false);
    }

    function clearInterval(taskId: number): void {
        clearIntervalOrTimeout(taskId);
    }

    function clearTimeout(taskId: number): void {
        clearIntervalOrTimeout(taskId);
    }

    runTasks();

    namespace betterRadio {
        const PACKET_SIZE = 15;
        let messageId = 0;

        export function sendString(message: string) {
            if (message.length === 0) {
                const idByte1 = messageId >> 8;
                const idByte2 = messageId & 0xff;
                const index = 0;
                const total = 1;

                const emptyMessagePacket = Buffer.fromArray([idByte1, idByte2, index, total]);

                radio.sendBuffer(emptyMessagePacket);
                messageId = (messageId + 1) % 65536;
                return;
            }

            const messageBuffer = Buffer.fromUTF8(message);

            const totalPackets = Math.ceil(messageBuffer.length / PACKET_SIZE);

            const packets: Buffer[] = [];

            for (let i = 0; i < messageBuffer.length; i += PACKET_SIZE) {
                const idByte1 = messageId >> 8;
                const idByte2 = messageId & 0xff;
                const index = i / PACKET_SIZE;
                const total = totalPackets;
                const segment = messageBuffer.slice(i, i + PACKET_SIZE);

                const packet = Buffer.fromArray([idByte1, idByte2, index, total]).concat(segment);
                packets.push(packet);
            }

            messageId = (messageId + 1) % 65536;

            packets.forEach(function (packet) {
                radio.sendBuffer(packet);
                basic.pause(10);
            });
        }

        interface ReceivedPackets {
            [senderId: number]: {
                [messageId: number]: (Buffer | null)[];
            };
        }

        const receivedPackets: ReceivedPackets = {};
        const listeners: ((receivedString: string) => void)[] = [];

        function removeExpiredPackets(senderId: number, messageId: number) {
            setTimeout(function () {
                if (receivedPackets[senderId] && receivedPackets[senderId][messageId]) {
                    delete receivedPackets[senderId][messageId];
                    if (Object.keys(receivedPackets[senderId]).length === 0) {
                        delete receivedPackets[senderId];
                    }
                }
            }, 1000);
        }

        radio.onReceivedBuffer(function (receivedBuffer) {
            const senderId = radio.receivedSerial();
            const messageId = (receivedBuffer[0] << 8) | receivedBuffer[1];
            const index = receivedBuffer[2];
            const total = receivedBuffer[3];
            const content = receivedBuffer.slice(4);

            if (!receivedPackets[senderId]) {
                receivedPackets[senderId] = {};
            }

            if (!receivedPackets[senderId][messageId]) {
                const packets: (Buffer | null)[] = [];
                for (let i = 0; i < total; i++) {
                    packets.push(null);
                }
                receivedPackets[senderId][messageId] = packets;

                removeExpiredPackets(senderId, messageId);
            }

            receivedPackets[senderId][messageId][index] = content;

            let isComplete = true;
            for (const packet of receivedPackets[senderId][messageId]) {
                if (packet === null) {
                    isComplete = false;
                    break;
                }
            }

            if (isComplete) {
                const messageBuffer = Buffer.concat(receivedPackets[senderId][messageId]);
                const message = messageBuffer.toString();

                for (const listener of listeners) {
                    listener(message);
                }

                delete receivedPackets[senderId][messageId];

                if (Object.keys(receivedPackets[senderId]).length === 0) {
                    delete receivedPackets[senderId];
                }
            }
        });

        // TODO: Standardize naming of variables (receivedString, mensaje, receivedMessage, etc.)
        export function onReceivedString(cb: (receivedString: string) => void) {
            listeners.push(cb);
        }
    }

    enum MessageType {
        Discovery,
        Acknowledgement,
        NotebookSet,
        NotebookDelete,
        NotebookSetShared,
        NotebookDeleteShared,
    }

    interface NotebookSetMessagePacket {
        type: MessageType.NotebookSet;
        data: {
            key: string;
            value: any;
        };
    }

    interface NotebookDeleteMessagePacket {
        type: MessageType.NotebookDelete;
        key: string;
    }

    interface NotebookSetSharedMessagePacket {
        type: MessageType.NotebookSetShared;
        data: {
            key: string;
            value: any;
        };
    }

    interface NotebookDeleteSharedMessagePacket {
        type: MessageType.NotebookDeleteShared;
        key: string;
    }

    interface DiscoveryMessagePacket {
        type: MessageType.Discovery;
        sender: string;
        group: string;
    }

    interface AcknowledgementPacket {
        type: MessageType.Acknowledgement;
        sender: string;
        receiver: string;
        id: number;
    }

    type RegularMessagePacket =
        | NotebookSetMessagePacket
        | NotebookDeleteMessagePacket
        | NotebookSetSharedMessagePacket
        | NotebookDeleteSharedMessagePacket;

    type FullRegularMessagePacket = RegularMessagePacket & {
        id: number;
        sender: string;
        group: string;
    };

    type MessagePacket = DiscoveryMessagePacket | AcknowledgementPacket | FullRegularMessagePacket;

    let myDeviceName = control.deviceName();
    let myGroup = "";

    interface Devices {
        [deviceName: string]: {
            lastSeen: number;
        };
    }

    const activeDevices: Devices = {};

    interface SimpleNotebook {
        [key: string]: any;
    }

    interface Notebook {
        [deviceName: string]: SimpleNotebook;
    }

    const notebook: Notebook = {};

    function sendDiscoveryMessage() {
        const discoveryMessage: DiscoveryMessagePacket = {
            type: MessageType.Discovery,
            sender: myDeviceName,
            group: myGroup,
        };

        betterRadio.sendString(JSON.stringify(discoveryMessage));
    }

    betterRadio.onReceivedString(function (receivedString: string) {
        const message: MessagePacket = JSON.parse(receivedString);
        if (message.type === MessageType.Discovery) {
            handleDiscoveryMessage(message);
        }
    });

    function handleDiscoveryMessage(message: DiscoveryMessagePacket) {
        const { sender, group } = message;
        if (group === myGroup) {
            activeDevices[sender] = {
                lastSeen: control.millis(),
            };
        }
    }

    function removeInactiveDevices() {
        const currentTime = control.millis();
        const names = Object.keys(activeDevices);
        for (const name of names) {
            if (currentTime - activeDevices[name].lastSeen > 10000) {
                delete activeDevices[name];
                if (notebook[name]) {
                    delete notebook[name];
                }
            }
        }
    }

    setInterval(sendDiscoveryMessage, 5000);
    setInterval(removeInactiveDevices, 2500);

    setTimeout(sendDiscoveryMessage);

    const acknowledgements: { [messageId: number]: { [deviceId: string]: boolean } } = {};

    function sendMessage(messagePacket: RegularMessagePacket) {
        const fullMessagePacket = messagePacket as FullRegularMessagePacket;
        fullMessagePacket.id = control.micros();
        fullMessagePacket.sender = myDeviceName;
        fullMessagePacket.group = myGroup;

        const messageId = fullMessagePacket.id;
        const payload = JSON.stringify(fullMessagePacket);

        acknowledgements[messageId] = {};

        const devicesNames = Object.keys(activeDevices);

        for (const deviceName of devicesNames) {
            acknowledgements[messageId][deviceName] = false;

            const intervalId = setInterval(function () {
                if (!acknowledgements[messageId][deviceName]) {
                    betterRadio.sendString(payload);
                }
            }, 300);

            setTimeout(function () {
                clearInterval(intervalId);
                delete acknowledgements[messageId][deviceName];
                if (Object.keys(acknowledgements[messageId]).length === 0) {
                    delete acknowledgements[messageId];
                }
            }, 3000);
        }

        betterRadio.sendString(payload);
    }

    betterRadio.onReceivedString(function (receivedString: string) {
        const messagePacket: MessagePacket = JSON.parse(receivedString);
        if (messagePacket.type === MessageType.Acknowledgement && messagePacket.receiver === myDeviceName) {
            const messageId = messagePacket.id;
            const deviceName = messagePacket.sender;

            if (acknowledgements[messageId] && acknowledgements[messageId][deviceName] === false) {
                acknowledgements[messageId][deviceName] = true;
            }
        }
    });

    const acknowledgedMessages: { [messageId: number]: boolean } = {};

    const listeners: ((messagePacket: FullRegularMessagePacket) => void)[] = [];

    function deleteAcknowledgedMessageById(messageId: number) {
        setTimeout(function () {
            delete acknowledgedMessages[messageId];
        }, 8000);
    }

    betterRadio.onReceivedString(function (receivedString: string) {
        const messagePacket: MessagePacket = JSON.parse(receivedString);

        if (messagePacket.type === MessageType.Discovery || messagePacket.type === MessageType.Acknowledgement) {
            return;
        }

        if (messagePacket.group !== myGroup) {
            return;
        }

        const messageId = messagePacket.id;

        const acknowledgementPacket: AcknowledgementPacket = {
            id: messageId,
            type: MessageType.Acknowledgement,
            sender: myDeviceName,
            receiver: messagePacket.sender,
        };

        betterRadio.sendString(JSON.stringify(acknowledgementPacket));

        if (acknowledgedMessages[messageId]) {
            return;
        }

        acknowledgedMessages[messageId] = true;

        deleteAcknowledgedMessageById(messageId);

        // TODO: Consider scheduling the message to be processed in the next iteration of the event loop
        for (const listener of listeners) {
            listener(messagePacket);
        }
    });

    function onMessageReceived(handler: (messagePacket: FullRegularMessagePacket) => void) {
        listeners.push(handler);
    }

    //% block="establecer canal de comunicacion a $canal"
    //% change.defl=1
    //% canal.min=0 canal.max=255
    //% group="Configuracion"
    //% weight=110
    export function setChannel(canal: number) {
        radio.setGroup(canal);
    }

    // TODO: Consider multiple devices with the same name

    //% block="registrar dispositivo con nombre $name"
    //% group="Configuracion"
    //% weight=100
    export function registerDevice(name: string) {
        myDeviceName = name;
    }

    //% block="$device"
    //% blockId=device_field
    //% blockHidden=true shim=TD_ID
    //% device.fieldEditor="autocomplete" device.fieldOptions.decompileLiterals=true
    //% device.fieldOptions.key="devices"
    export function _deviceField(device: string) {
        return device;
    }

    //% block="establecer mi grupo a $group"
    //% group="Configuracion"
    //% weight=90
    export function setGroup(group: string) {
        myGroup = group;
    }

    function notifySet(key: string, value: any) {
        const messagePacket: NotebookSetMessagePacket = {
            type: MessageType.NotebookSet,
            data: { key, value },
        };
        sendMessage(messagePacket);
    }

    function notifyDelete(key: string) {
        const messagePacket: NotebookDeleteMessagePacket = {
            type: MessageType.NotebookDelete,
            key,
        };
        sendMessage(messagePacket);
    }

    function setValue(deviceName: string, key: string, value: any) {
        if (notebook[deviceName] === undefined) {
            notebook[deviceName] = {};
        }
        notebook[deviceName][key] = value;
    }

    function getValue(deviceName: string, key: string) {
        return notebook[deviceName] && notebook[deviceName][key];
    }

    function deleteValue(deviceName: string, key: string) {
        if (notebook[deviceName] === undefined) {
            return;
        }
        delete notebook[deviceName][key];
    }

    onMessageReceived(function (messagePacket) {
        if (messagePacket.type === MessageType.NotebookSet) {
            setValue(messagePacket.sender, messagePacket.data.key, messagePacket.data.value);
        }
    });

    onMessageReceived(function (messagePacket) {
        if (messagePacket.type === MessageType.NotebookDelete) {
            deleteValue(messagePacket.sender, messagePacket.key);
        }
    });

    //% block="$key"
    //% blockId=notebook_key
    //% blockHidden=true shim=TD_ID
    //% key.fieldEditor="autocomplete" key.fieldOptions.decompileLiterals=true
    //% key.fieldOptions.key="notebook_keys"
    export function _notebookKey(key: string) {
        return key;
    }

    //% block="escribir $key = $value en mi hoja"
    //% key.shadow=notebook_key key.defl="clave"
    //% value.shadow=text value.defl="valor"
    //% weight=100 group="Mi hoja"
    export function setMyValue(key: string, value: any) {
        setValue(myDeviceName, key, value);
        notifySet(key, value);
    }

    //% block="valor de $key en mi hoja"
    //% key.defl="clave"
    //% key.shadow=notebook_key
    //% weight=90 group="Mi hoja"
    export function getMyValue(key: string) {
        const value = getValue(myDeviceName, key);
        return value;
    }

    //% block="existe $key en mi hoja"
    //% key.defl="clave"
    //% key.shadow=notebook_key
    //% weight=80 group="Mi hoja"
    export function doesMyKeyExist(key: string): boolean {
        return getValue(myDeviceName, key) !== undefined;
    }

    //% block="borrar $key de mi hoja"
    //% key.defl="clave"
    //% key.shadow=notebook_key
    //% weight=70 group="Mi hoja"
    export function deleteMyKey(key: string) {
        deleteValue(myDeviceName, key);
        notifyDelete(key);
    }

    //% block="valor de $key en la hoja de $deviceName"
    //% deviceName.shadow=device_field
    //% key.defl="clave"
    //% key.shadow=notebook_key
    //% weight=100 group="Hojas de mi grupo"
    export function getValueFrom(deviceName: string, key: string) {
        const value = getValue(deviceName, key);
        return value;
    }

    //% block="al recibir un nuevo $valor de $key en la hoja de $device"
    //% key.defl="clave"
    //% device.shadow=device_field key.shadow=notebook_key
    //% draggableParameters="reporter"
    //% weight=90 group="Hojas de mi grupo"
    export function onUpdateFrom(device: string, key: string, handler: (valor: any) => void) {
        onMessageReceived(function (messagePacket) {
            if (
                messagePacket.type === MessageType.NotebookSet &&
                messagePacket.sender === device &&
                messagePacket.data.key === key
            ) {
                handler(messagePacket.data.value);
            }
        });
    }

    //% block="cuando el valor de $key en la hoja de $device sea $value"
    //% device.shadow=device_field
    //% key.defl="clave"
    //% value.shadow=math_number
    //% draggableParameters="reporter"
    //% weight=80 group="Hojas de mi grupo"
    export function onValueFrom(device: string, key: string, value: any, handler: () => void) {
        onUpdateFrom(device, key, (newValue) => {
            if (newValue === value) {
                handler();
            }
        });
    }

    //% block="existe $key en la hoja de $device"
    //% device.shadow=device_field
    //% key.defl="clave"
    //% key.shadow=notebook_key
    //% weight=80 group="Hojas de mi grupo"
    export function doesKeyExistFrom(device: string, key: string): boolean {
        return getValue(device, key) !== undefined;
    }

    export enum Operation {
        //% block="Maximo"
        MAX,
        //% block="Minimo"
        MIN,
        //% block="Suma"
        SUM,
        //% block="Promedio"
        AVG,
    }

    function getMemberValuesForKey(key: string) {
        const fullMembers = Object.keys(activeDevices).concat([myDeviceName]);

        const memberValues: { memberName: string; value: any }[] = [];

        fullMembers.forEach((member) => {
            const value = getValue(member, key);
            if (typeof value === "undefined") {
                return;
            }
            memberValues.push({ memberName: member, value });
        });

        return memberValues;
    }

    function getNumberMemberValuesForKey(key: string) {
        const fullMembers = Object.keys(activeDevices).concat([myDeviceName]);

        const memberValues: { memberName: string; value: number }[] = [];

        fullMembers.forEach((member) => {
            const value = getValue(member, key);
            if (typeof value !== "number") {
                return;
            }
            memberValues.push({ memberName: member, value });
        });

        return memberValues;
    }

    //% block="valor $operation de $key"
    //% key.defl="clave"
    //% key.shadow=notebook_key
    //% weight=70 group="Hojas de mi grupo"
    export function getAggregateValueFrom(key: string, operation: Operation): number {
        const memberValues = getNumberMemberValuesForKey(key);

        if (!memberValues.length) {
            return 0;
        }

        const values = memberValues.map((item) => item.value);

        switch (operation) {
            case Operation.MAX:
                return values.reduce((max, value) => Math.max(max, value), -Infinity);
            case Operation.MIN:
                return values.reduce((min, value) => Math.min(min, value), Infinity);
            case Operation.SUM:
                return values.reduce((acc, curr) => acc + curr, 0);
            case Operation.AVG:
                return values.reduce((acc, curr) => acc + curr, 0) / values.length;
        }
    }

    export enum DeviceOperation {
        //% block="Maximo"
        MAX,
        //% block="Minimo"
        MIN,
    }

    //% block="dispositivo con $operation de $key"
    //% key.defl="clave"
    //% key.shadow=notebook_key
    //% weight=60 group="Hojas de mi grupo"
    export function getDeviceWithExtremaValue(key: string, operation: DeviceOperation): string {
        const realOperation = operation === DeviceOperation.MAX ? Operation.MAX : Operation.MIN;
        const aggregateValue = getAggregateValueFrom(key, realOperation);

        const memberValues = getNumberMemberValuesForKey(key);
        for (const member of memberValues) {
            if (member.value === aggregateValue) {
                return member.memberName;
            }
        }

        return "";
    }

    //% block="dispositivo con $key igual a $value"
    //% key.defl="clave"
    //% value.shadow=math_number
    //% key.shadow=notebook_key
    //% weight=50 group="Hojas de mi grupo"
    export function getDeviceWithValue(key: string, value: any): string {
        const memberValues = getNumberMemberValuesForKey(key);
        for (const member of memberValues) {
            if (member.value === value) {
                return member.memberName;
            }
        }

        return "";
    }

    //% block="para cada $dispositivo y $valor de $key"
    //% key.defl="clave"
    //% key.shadow=notebook_key
    //% draggableParameters="reporter"
    //% handlerStatement
    //% weight=40 group="Hojas de mi grupo"
    export function iterateOverStringKeyValues(key: string, handler: (dispositivo: string, valor: any) => void) {
        const memberValues = getMemberValuesForKey(key);

        memberValues.forEach((item) => {
            handler(item.memberName, item.value);
        });
    }

    const sharedNotebook: SimpleNotebook = {};

    function notifySetShared(key: string, value: any) {
        const messagePacket: NotebookSetSharedMessagePacket = {
            type: MessageType.NotebookSetShared,
            data: { key, value },
        };

        sendMessage(messagePacket);
    }

    function notifyDeleteShared(key: string) {
        const messagePacket: NotebookDeleteSharedMessagePacket = {
            type: MessageType.NotebookDeleteShared,
            key,
        };

        sendMessage(messagePacket);
    }

    onMessageReceived(function (messagePacket) {
        if (messagePacket.type === MessageType.NotebookSetShared) {
            sharedNotebook[messagePacket.data.key] = messagePacket.data.value;
        }
    });

    onMessageReceived(function (messagePacket) {
        if (messagePacket.type === MessageType.NotebookDeleteShared) {
            delete sharedNotebook[messagePacket.key];
        }
    });

    //% block="$key"
    //% blockId=notebook_key_shared
    //% blockHidden=true shim=TD_ID
    //% key.fieldEditor="autocomplete" key.fieldOptions.decompileLiterals=true
    //% key.fieldOptions.key="notebook_keys_shared"
    export function _notebookKeyShared(key: string) {
        return key;
    }

    //% block="escribir $key = $value en la hoja compartida"
    //% value.shadow=text value.defl="valor"
    //% key.shadow=notebook_key_shared key.defl="clave"
    //% weight=100 group="Hoja compartida"
    export function setValueShared(key: string, value: any) {
        sharedNotebook[key] = value;
        notifySetShared(key, value);
    }

    //% block="valor de $key en la hoja compartida"
    //% key.defl="clave"
    //% key.shadow=notebook_key_shared
    //% weight=90 group="Hoja compartida"
    export function getValueShared(key: string) {
        const value = sharedNotebook[key];
        return value;
    }

    //% block="existe $key en la hoja compartida"
    //% key.defl="clave"
    //% key.shadow=notebook_key_shared
    //% weight=80 group="Hoja compartida"
    export function doesKeyExistShared(key: string): boolean {
        return sharedNotebook[key] !== undefined;
    }

    //% block="borrar $key de la hoja compartida"
    //% key.defl="clave"
    //% weight=70 group="Hoja compartida"
    export function deleteKeyShared(key: string) {
        delete sharedNotebook[key];
        notifyDeleteShared(key);
    }

    //% block="al recibir un nuevo $valor de $key en la hoja compartida"
    //% key.defl="clave"
    //% key.shadow=notebook_key_shared
    //% draggableParameters="reporter"
    //% weight=60 group="Hoja compartida"
    export function onUpdateShared(key: string, handler: (valor: any) => void) {
        onMessageReceived(function (messagePacket) {
            if (messagePacket.type === MessageType.NotebookSetShared && messagePacket.data.key === key) {
                handler(messagePacket.data.value);
            }
        });
    }

    //% block="cuando el valor de $key en la hoja compartida sea $value"
    //% key.defl="clave"
    //% key.shadow=notebook_key_shared
    //% value.shadow=math_number
    //% draggableParameters="reporter"
    //% weight=50 group="Hoja compartida"
    export function onValueShared(key: string, value: any, handler: () => void) {
        onUpdateShared(key, (newValue) => {
            if (newValue === value) {
                handler();
            }
        });
    }
}
