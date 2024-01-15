//% block="Cuaderno"
//% color="#32a852"
//% icon="\uf02d"
namespace notebook {
    radio.setGroup(1);
    radio.setTransmitSerialNumber(true);

    namespace betterRadio {
        const PACKET_SIZE = 16;
        let messageId = 0;

        export function sendString(message: string) {
            if (message.length === 0) {
                const id = String.fromCharCode(messageId);
                const index = String.fromCharCode(0);
                const total = String.fromCharCode(1);
                const segment = "";

                const emptyMessagePacket = `${id}${index}${total}${segment}`;

                radio.sendString(emptyMessagePacket);
                messageId = (messageId + 1) % 256;
                return;
            }

            const totalPackets = Math.ceil(message.length / PACKET_SIZE);

            const packets = [];

            for (let i = 0; i < message.length; i += PACKET_SIZE) {
                const id = String.fromCharCode(messageId);
                const index = String.fromCharCode(i / PACKET_SIZE);
                const total = String.fromCharCode(totalPackets);
                const segment = message.substr(i, PACKET_SIZE);

                const packet = `${id}${index}${total}${segment}`;
                packets.push(packet);
            }

            packets.forEach(function (packet) {
                radio.sendString(packet);
            });

            messageId = (messageId + 1) % 256;
        }

        interface ReceivedPackets {
            [senderId: number]: {
                [messageId: number]: string[];
            };
        }

        const receivedPackets: ReceivedPackets = {};
        const listeners: ((receivedString: string) => void)[] = [];

        radio.onReceivedString(function (receivedString) {
            const senderId = radio.receivedSerial();
            const messageId = receivedString.charCodeAt(0);
            const index = receivedString.charCodeAt(1);
            const total = receivedString.charCodeAt(2);
            const content = receivedString.substr(3);

            if (!receivedPackets[senderId]) {
                receivedPackets[senderId] = {};
            }

            if (!receivedPackets[senderId][messageId]) {
                const packets = [];
                for (let i = 0; i < total; i++) {
                    packets.push(null);
                }
                receivedPackets[senderId][messageId] = packets;
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
                const message = receivedPackets[senderId][messageId].join("");

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
        NotebookSet,
        NotebookDelete,
        NotebookSetShared,
        NotebookDeleteShared,
    }

    interface NotebookSetMessagePacket {
        sender: string;
        type: MessageType.NotebookSet;
        group: string | null;
        data: {
            key: string;
            value: string | number;
        };
    }

    interface NotebookDeleteMessagePacket {
        sender: string;
        type: MessageType.NotebookDelete;
        group: string | null;
        key: string;
    }

    interface NotebookSetSharedMessagePacket {
        sender: string;
        type: MessageType.NotebookSetShared;
        group: string | null;
        data: {
            key: string;
            value: string | number;
        };
    }

    interface NotebookDeleteSharedMessagePacket {
        sender: string;
        type: MessageType.NotebookDeleteShared;
        group: string | null;
        key: string;
    }

    type MessagePacket =
        | NotebookSetMessagePacket
        | NotebookDeleteMessagePacket
        | NotebookSetSharedMessagePacket
        | NotebookDeleteSharedMessagePacket;

    //% block="establecer canal de comunicacion a $canal"
    //% change.defl=1
    //% canal.min=0 canal.max=255
    //% group="Configuracion"
    //% weight=110
    export function setChannel(canal: number) {
        radio.setGroup(canal);
    }

    let myDeviceName = control.deviceName();

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

    let myGroup = "";

    //% block="establecer mi grupo a $group"
    //% group="Configuracion"
    //% weight=90
    export function setGroup(group: string) {
        myGroup = group;
    }

    interface SimpleNotebook {
        [key: string]: any;
    }

    interface Notebook {
        [deviceName: string]: SimpleNotebook;
    }

    const notebook: Notebook = {};

    function notifySet(key: string, value: any) {
        const messagePacket: NotebookSetMessagePacket = {
            sender: myDeviceName,
            type: MessageType.NotebookSet,
            data: { key, value },
            group: myGroup,
        };
        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    function notifyDelete(key: string) {
        const messagePacket: NotebookDeleteMessagePacket = {
            sender: myDeviceName,
            type: MessageType.NotebookDelete,
            key,
            group: myGroup,
        };
        betterRadio.sendString(JSON.stringify(messagePacket));
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

    const groupMembers: string[] = [];

    betterRadio.onReceivedString(function (receivedData) {
        const messagePacket: MessagePacket = JSON.parse(receivedData);

        if (messagePacket.type !== MessageType.NotebookSet) {
            return;
        }

        if (messagePacket.group === myGroup) {
            setValue(messagePacket.sender, messagePacket.data.key, messagePacket.data.value);
            if (groupMembers.indexOf(messagePacket.sender) === -1) {
                groupMembers.push(messagePacket.sender);
            }
        }
    });

    betterRadio.onReceivedString(function (receivedData) {
        const messagePacket: MessagePacket = JSON.parse(receivedData);

        if (messagePacket.type !== MessageType.NotebookDelete) {
            return;
        }

        if (messagePacket.group === myGroup) {
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
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);

            if (
                messagePacket.type === MessageType.NotebookSet &&
                messagePacket.sender === device &&
                messagePacket.data.key === key &&
                messagePacket.group === myGroup
            ) {
                handler(messagePacket.data.value);
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
        const fullMembers = groupMembers.concat([myDeviceName]);

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
        const fullMembers = groupMembers.concat([myDeviceName]);

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
    //% weight=100 group="Hoja resumen"
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
    //% weight=90 group="Hoja resumen"
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
    //% weight=80 group="Hoja resumen"
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
    //% weight=70 group="Hoja resumen"
    export function iterateOverStringKeyValues(key: string, handler: (dispositivo: string, valor: any) => void) {
        const memberValues = getMemberValuesForKey(key);

        memberValues.forEach((item) => {
            handler(item.memberName, item.value);
        });
    }

    const sharedNotebook: SimpleNotebook = {};

    function notifySetShared(key: string, value: string | number) {
        const messagePacket: NotebookSetSharedMessagePacket = {
            sender: myDeviceName,
            type: MessageType.NotebookSetShared,
            data: { key, value },
            group: myGroup,
        };

        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    function notifyDeleteShared(key: string) {
        const messagePacket: NotebookDeleteSharedMessagePacket = {
            sender: myDeviceName,
            type: MessageType.NotebookDeleteShared,
            key,
            group: myGroup,
        };

        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    betterRadio.onReceivedString(function (receivedData) {
        const messagePacket: MessagePacket = JSON.parse(receivedData);

        if (messagePacket.type !== MessageType.NotebookSetShared) {
            return;
        }

        if (messagePacket.group === myGroup) {
            sharedNotebook[messagePacket.data.key] = messagePacket.data.value;
        }
    });

    betterRadio.onReceivedString(function (receivedData) {
        const messagePacket: MessagePacket = JSON.parse(receivedData);

        if (messagePacket.type !== MessageType.NotebookDeleteShared) {
            return;
        }

        if (messagePacket.group === myGroup) {
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
    export function getValueShared(key: string): string {
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
}
