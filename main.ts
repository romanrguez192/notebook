//% block="Comunicacion"
//% color="#32a852"
//% icon="\uf1eb"
namespace distributed {
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
        Direct,
        DirectEvent,
        Group,
        GroupEvent,
        Broadcast,
        BroadcastEvent,
        NotebookSet,
        NotebookDelete,
        NotebookSetShared,
        NotebookDeleteShared,
    }

    interface BaseMessagePacket {
        sender: string;
        data: string | number;
    }

    interface DirectMessagePacket extends BaseMessagePacket {
        type: MessageType.Direct;
        receiver: string;
    }

    interface DirectEventMessagePacket {
        sender: string;
        type: MessageType.DirectEvent;
        receiver: string;
        event: string;
    }

    interface GroupMessagePacket extends BaseMessagePacket {
        type: MessageType.Group;
        group: string;
    }

    interface GroupEventMessagePacket {
        sender: string;
        type: MessageType.GroupEvent;
        group: string;
        event: string;
    }

    interface BroadcastMessagePacket extends BaseMessagePacket {
        type: MessageType.Broadcast;
    }

    interface BroadcastEventMessagePacket {
        sender: string;
        type: MessageType.BroadcastEvent;
        event: string;
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
        | DirectMessagePacket
        | GroupMessagePacket
        | NotebookSetMessagePacket
        | NotebookDeleteMessagePacket
        | NotebookSetSharedMessagePacket
        | NotebookDeleteSharedMessagePacket
        | BroadcastMessagePacket;

    //% block="establecer canal de comunicacion a $canal"
    //% change.defl=1
    //% canal.min=0 canal.max=255
    //% group="Configuracion"
    //% weight=110
    export function setChannel(canal: number) {
        radio.setGroup(canal);
    }

    let deviceName = control.deviceName();

    // TODO: Consider multiple devices with the same name

    //% block="registrar dispositivo con nombre $name"
    //% group="Configuracion"
    //% weight=100
    export function registerDevice(name: string) {
        deviceName = name;
    }

    //% block="$device"
    //% blockId=device_field
    //% blockHidden=true shim=TD_ID
    //% device.fieldEditor="autocomplete" device.fieldOptions.decompileLiterals=true
    //% device.fieldOptions.key="devices"
    export function _deviceField(device: string) {
        return device;
    }

    //% block="enviar mensaje de texto $message a $receiver"
    //% message.defl="hola" receiver.defl="nombre"
    //% receiver.shadow=device_field
    //% group="Mensajes Directos"
    //% weight=100
    export function sendDirectStringMessage(receiver: string, message: string) {
        const messagePacket: DirectMessagePacket = {
            type: MessageType.Direct,
            sender: deviceName,
            data: message,
            receiver,
        };
        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    //% block="al recibir un $mensaje de texto directo de $emisor"
    //% group="Mensajes Directos"
    //% draggableParameters="reporter"
    //% weight=90
    export function onDirectStringMessageReceived(handler: (mensaje: string, emisor: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.Direct &&
                messagePacket.receiver === deviceName &&
                typeof messagePacket.data === "string"
            ) {
                handler(messagePacket.data, messagePacket.sender);
            }
        });
    }

    //% block="al recibir un $mensaje de texto directo de $sender"
    //% sender.shadow=device_field
    //% group="Mensajes Directos"
    //% draggableParameters="reporter"
    //% weight=85
    export function onDirectStringMessageReceivedFrom(sender: string, handler: (mensaje: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.Direct &&
                messagePacket.receiver === deviceName &&
                messagePacket.sender === sender &&
                typeof messagePacket.data === "string"
            ) {
                handler(messagePacket.data);
            }
        });
    }

    //% block="enviar numero $message a $receiver"
    //% receiver.shadow=device_field
    //% receiver.defl="nombre"
    //% group="Mensajes Directos"
    //% weight=80
    export function sendDirectNumberMessage(receiver: string, message: number) {
        const messagePacket: DirectMessagePacket = {
            type: MessageType.Direct,
            sender: deviceName,
            data: message,
            receiver,
        };
        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    //% block="al recibir un $mensaje numerico directo de $emisor"
    //% group="Mensajes Directos"
    //% draggableParameters="reporter"
    //% weight=70
    export function onDirectNumberMessageReceived(handler: (mensaje: number, emisor: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.Direct &&
                messagePacket.receiver === deviceName &&
                typeof messagePacket.data === "number"
            ) {
                handler(messagePacket.data, messagePacket.sender);
            }
        });
    }

    //% block="al recibir un $mensaje numerico directo de $sender"
    //% sender.shadow=device_field
    //% group="Mensajes Directos"
    //% draggableParameters="reporter"
    //% weight=60
    export function onDirectNumberMessageReceivedFrom(sender: string, handler: (mensaje: number) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.Direct &&
                messagePacket.receiver === deviceName &&
                messagePacket.sender === sender &&
                typeof messagePacket.data === "number"
            ) {
                handler(messagePacket.data);
            }
        });
    }

    //% block="$event"
    //% blockId=event_field
    //% blockHidden=true shim=TD_ID
    //% event.fieldEditor="autocomplete" event.fieldOptions.decompileLiterals=true
    //% event.fieldOptions.key="events"
    export function _eventField(event: string) {
        return event;
    }

    //% block="enviar evento $event a $receiver"
    //% event.defl="evento" receiver.defl="nombre"
    //% receiver.shadow=device_field event.shadow=event_field
    //% group="Eventos Directos"
    //% weight=50
    export function sendDirectEvent(receiver: string, event: string) {
        const messagePacket: DirectEventMessagePacket = {
            type: MessageType.DirectEvent,
            sender: deviceName,
            receiver,
            event,
        };
        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    //% block="al recibir un $evento directo de $emisor"
    //% group="Eventos Directos"
    //% draggableParameters="reporter"
    //% weight=40
    export function onDirectEventReceived(handler: (evento: string, emisor: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: DirectEventMessagePacket = JSON.parse(receivedString);
            if (messagePacket.type === MessageType.DirectEvent && messagePacket.receiver === deviceName) {
                handler(messagePacket.event, messagePacket.sender);
            }
        });
    }

    //% block="al recibir un $evento directo de $sender"
    //% sender.shadow=device_field
    //% group="Eventos Directos"
    //% draggableParameters="reporter"
    //% weight=30
    export function onDirectEventReceivedFrom(sender: string, handler: (evento: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: DirectEventMessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.DirectEvent &&
                messagePacket.receiver === deviceName &&
                messagePacket.sender === sender
            ) {
                handler(messagePacket.event);
            }
        });
    }

    //% block="al recibir el evento $event directo de $emisor"
    //% event.shadow=event_field
    //% group="Eventos Directos"
    //% draggableParameters="reporter"
    //% weight=20
    export function onDirectEventReceivedWithEvent(event: string, handler: (emisor: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: DirectEventMessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.DirectEvent &&
                messagePacket.receiver === deviceName &&
                messagePacket.event === event
            ) {
                handler(messagePacket.sender);
            }
        });
    }

    //% block="al recibir el evento $event directo de $sender"
    //% sender.shadow=device_field
    //% event.shadow=event_field
    //% group="Eventos Directos"
    //% draggableParameters="reporter"
    //% weight=10
    export function onDirectEventReceivedFromWithEvent(sender: string, event: string, handler: () => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: DirectEventMessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.DirectEvent &&
                messagePacket.receiver === deviceName &&
                messagePacket.sender === sender &&
                messagePacket.event === event
            ) {
                handler();
            }
        });
    }

    // TODO: Consider turning this into a block
    const groupsJoined: string[] = [];

    //% block="$group"
    //% blockId=group_field
    //% blockHidden=true shim=TD_ID
    //% group.fieldEditor="autocomplete" group.fieldOptions.decompileLiterals=true
    //% group.fieldOptions.key="groups"
    export function _groupField(group: string) {
        return group;
    }

    //% block="unirse al grupo $group"
    //% group.shadow=group_field
    //% group="Mensajes de Grupo"
    //% weight=120
    export function joinGroup(group: string) {
        if (groupsJoined.indexOf(group) === -1) {
            groupsJoined.push(group);
        }
    }

    //% block="salir del grupo $group"
    //% group.shadow=group_field
    //% group="Mensajes de Grupo"
    //% weight=110
    export function leaveGroup(group: string) {
        const index = groupsJoined.indexOf(group);
        if (index !== -1) {
            groupsJoined.splice(index, 1);
        }
    }

    //% block="enviar mensaje de texto $message al grupo $group"
    //% message.defl="hola"
    //% group.shadow=group_field
    //% group="Mensajes de Grupo"
    //% weight=100
    export function sendStringMessageToGroup(group: string, message: string) {
        if (groupsJoined.indexOf(group) === -1) {
            return;
        }

        const messagePacket: GroupMessagePacket = {
            type: MessageType.Group,
            sender: deviceName,
            data: message,
            group,
        };
        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    //% block="al recibir un $mensaje de texto de $emisor en el grupo $group"
    //% group.shadow=group_field
    //% group="Mensajes de Grupo"
    //% draggableParameters="reporter"
    //% weight=90
    export function onReceivedStringMessageFromGroup(
        group: string,
        handler: (mensaje: string, emisor: string) => void
    ) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.Group &&
                messagePacket.group === group &&
                groupsJoined.indexOf(group) !== -1 &&
                typeof messagePacket.data === "string"
            ) {
                handler(messagePacket.data, messagePacket.sender);
            }
        });
    }

    //% block="al recibir un $mensaje de texto de $sender en el grupo $group"
    //% sender.shadow=device_field
    //% group.shadow=group_field
    //% group="Mensajes de Grupo"
    //% draggableParameters="reporter"
    //% weight=85
    export function onReceivedStringMessageFromGroupFrom(
        group: string,
        sender: string,
        handler: (mensaje: string) => void
    ) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.Group &&
                messagePacket.group === group &&
                groupsJoined.indexOf(group) !== -1 &&
                messagePacket.sender === sender &&
                typeof messagePacket.data === "string"
            ) {
                handler(messagePacket.data);
            }
        });
    }

    //% block="enviar numero $message al grupo $group"
    //% group.shadow=group_field
    //% group="Mensajes de Grupo"
    //% weight=80
    export function sendNumberMessageToGroup(group: string, message: number) {
        if (groupsJoined.indexOf(group) === -1) {
            return;
        }

        const messagePacket: GroupMessagePacket = {
            type: MessageType.Group,
            sender: deviceName,
            data: message,
            group,
        };
        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    //% block="al recibir un $mensaje numerico de $emisor en el grupo $group"
    //% group.shadow=group_field
    //% group="Mensajes de Grupo"
    //% draggableParameters="reporter"
    //% weight=70
    export function onReceivedNumberMessageFromGroup(
        group: string,
        handler: (mensaje: number, emisor: string) => void
    ) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.Group &&
                messagePacket.group === group &&
                groupsJoined.indexOf(group) !== -1 &&
                typeof messagePacket.data === "number"
            ) {
                handler(messagePacket.data, messagePacket.sender);
            }
        });
    }

    //% block="al recibir un $mensaje numerico de $sender en el grupo $group"
    //% sender.shadow=device_field
    //% group.shadow=group_field
    //% group="Mensajes de Grupo"
    //% draggableParameters="reporter"
    //% weight=65
    export function onReceivedNumberMessageFromGroupFrom(
        group: string,
        sender: string,
        handler: (mensaje: number) => void
    ) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.Group &&
                messagePacket.group === group &&
                groupsJoined.indexOf(group) !== -1 &&
                messagePacket.sender === sender &&
                typeof messagePacket.data === "number"
            ) {
                handler(messagePacket.data);
            }
        });
    }

    //% block="enviar evento $event al grupo $group"
    //% event.defl="evento"
    //% group.shadow=group_field
    //% group="Eventos de Grupo"
    //% weight=60
    export function sendEventToGroup(group: string, event: string) {
        if (groupsJoined.indexOf(group) === -1) {
            return;
        }

        const messagePacket: GroupEventMessagePacket = {
            type: MessageType.GroupEvent,
            sender: deviceName,
            group,
            event,
        };
        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    //% block="al recibir un $evento de $emisor en el grupo $group"
    //% group.shadow=group_field
    //% group="Eventos de Grupo"
    //% draggableParameters="reporter"
    //% weight=50
    export function onReceivedEventFromGroup(group: string, handler: (evento: string, emisor: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: GroupEventMessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.GroupEvent &&
                messagePacket.group === group &&
                groupsJoined.indexOf(group) !== -1
            ) {
                handler(messagePacket.event, messagePacket.sender);
            }
        });
    }

    //% block="al recibir un $evento de $sender en el grupo $group"
    //% sender.shadow=device_field
    //% group.shadow=group_field
    //% group="Eventos de Grupo"
    //% draggableParameters="reporter"
    //% weight=40
    export function onReceivedEventFromGroupFrom(group: string, sender: string, handler: (evento: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: GroupEventMessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.GroupEvent &&
                messagePacket.group === group &&
                groupsJoined.indexOf(group) !== -1 &&
                messagePacket.sender === sender
            ) {
                handler(messagePacket.event);
            }
        });
    }

    //% block="al recibir el evento $event de $emisor en el grupo $group"
    //% event.shadow=event_field
    //% group.shadow=group_field
    //% group="Eventos de Grupo"
    //% draggableParameters="reporter"
    //% weight=30
    export function onReceivedEventFromGroupWithEvent(group: string, event: string, handler: (emisor: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: GroupEventMessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.GroupEvent &&
                messagePacket.group === group &&
                groupsJoined.indexOf(group) !== -1 &&
                messagePacket.event === event
            ) {
                handler(messagePacket.sender);
            }
        });
    }

    //% block="al recibir el evento $event de $sender en el grupo $group"
    //% sender.shadow=device_field
    //% event.shadow=event_field
    //% group.shadow=group_field
    //% group="Eventos de Grupo"
    //% draggableParameters="reporter"
    //% weight=20
    export function onReceivedEventFromGroupFromWithEvent(
        group: string,
        sender: string,
        event: string,
        handler: () => void
    ) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: GroupEventMessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.GroupEvent &&
                messagePacket.group === group &&
                groupsJoined.indexOf(group) !== -1 &&
                messagePacket.sender === sender &&
                messagePacket.event === event
            ) {
                handler();
            }
        });
    }

    //% block="enviar mensaje de texto $message por difusion"
    //% message.defl="hola"
    //% group="Mensajes de Difusion"
    //% weight=100
    export function broadcastStringMessage(message: string) {
        const messagePacket: BroadcastMessagePacket = {
            type: MessageType.Broadcast,
            sender: deviceName,
            data: message,
        };
        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    //% block="al recibir un $mensaje de texto de $emisor por difusion"
    //% group="Mensajes de Difusion"
    //% draggableParameters="reporter"
    //% weight=90
    export function onReceivedStringBroadcast(handler: (mensaje: string, emisor: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (messagePacket.type === MessageType.Broadcast && typeof messagePacket.data === "string") {
                handler(messagePacket.data, messagePacket.sender);
            }
        });
    }

    //% block="al recibir un $mensaje de texto de $sender por difusion"
    //% sender.shadow=device_field
    //% group="Mensajes de Difusion"
    //% draggableParameters="reporter"
    //% weight=85
    export function onReceivedStringBroadcastFrom(sender: string, handler: (mensaje: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.Broadcast &&
                messagePacket.sender === sender &&
                typeof messagePacket.data === "string"
            ) {
                handler(messagePacket.data);
            }
        });
    }

    //% block="enviar numero $message por difusion"
    //% group="Mensajes de Difusion"
    //% weight=80
    export function broadcastNumberMessage(message: number) {
        const messagePacket: BroadcastMessagePacket = {
            type: MessageType.Broadcast,
            sender: deviceName,
            data: message,
        };
        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    //% block="al recibir un $mensaje numerico de $emisor por difusion"
    //% group="Mensajes de Difusion"
    //% draggableParameters="reporter"
    //% weight=70
    export function onReceivedNumberBroadcast(handler: (mensaje: number, emisor: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (messagePacket.type === MessageType.Broadcast && typeof messagePacket.data === "number") {
                handler(messagePacket.data, messagePacket.sender);
            }
        });
    }

    //% block="al recibir un $mensaje numerico de $sender por difusion"
    //% sender.shadow=device_field
    //% group="Mensajes de Difusion"
    //% draggableParameters="reporter"
    //% weight=65
    export function onReceivedNumberBroadcastFrom(sender: string, handler: (mensaje: number) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.Broadcast &&
                messagePacket.sender === sender &&
                typeof messagePacket.data === "number"
            ) {
                handler(messagePacket.data);
            }
        });
    }

    //% block="enviar evento $event por difusion"
    //% event.defl="evento"
    //% group="Eventos de Difusion"
    //% weight=60
    export function broadcastEvent(event: string) {
        const messagePacket: BroadcastEventMessagePacket = {
            type: MessageType.BroadcastEvent,
            sender: deviceName,
            event,
        };
        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    //% block="al recibir un $evento de difusion de $emisor"
    //% group="Eventos de Difusion"
    //% draggableParameters="reporter"
    //% weight=50
    export function onReceivedEventBroadcast(handler: (evento: string, emisor: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: BroadcastEventMessagePacket = JSON.parse(receivedString);
            if (messagePacket.type === MessageType.BroadcastEvent) {
                handler(messagePacket.event, messagePacket.sender);
            }
        });
    }

    //% block="al recibir un $evento de difusion de $sender"
    //% sender.shadow=device_field
    //% group="Eventos de Difusion"
    //% draggableParameters="reporter"
    //% weight=40
    export function onReceivedEventBroadcastFrom(sender: string, handler: (evento: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: BroadcastEventMessagePacket = JSON.parse(receivedString);
            if (messagePacket.type === MessageType.BroadcastEvent && messagePacket.sender === sender) {
                handler(messagePacket.event);
            }
        });
    }

    //% block="al recibir el evento $event de difusion de $emisor"
    //% event.shadow=event_field
    //% group="Eventos de Difusion"
    //% draggableParameters="reporter"
    //% weight=30
    export function onReceivedEventBroadcastWithEvent(event: string, handler: (emisor: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: BroadcastEventMessagePacket = JSON.parse(receivedString);
            if (messagePacket.type === MessageType.BroadcastEvent && messagePacket.event === event) {
                handler(messagePacket.sender);
            }
        });
    }

    //% block="al recibir el evento $event directo de $sender"
    //% sender.shadow=device_field
    //% event.shadow=event_field
    //% group="Eventos de Difusion"
    //% draggableParameters="reporter"
    //% weight=20
    export function onReceivedEventBroadcastFromWithEvent(sender: string, event: string, handler: () => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: BroadcastEventMessagePacket = JSON.parse(receivedString);
            if (
                messagePacket.type === MessageType.BroadcastEvent &&
                messagePacket.sender === sender &&
                messagePacket.event === event
            ) {
                handler();
            }
        });
    }

    // TODO: Add more functions for number, boolean, etc.

    interface SimpleNotebook {
        [key: string]: string | number;
    }

    interface Notebook {
        [deviceName: string]: SimpleNotebook;
    }

    const notebook: Notebook = {};

    function notifySet(key: string, value: string | number) {
        if (groupsJoined.length === 0) {
            const messagePacket: NotebookSetMessagePacket = {
                sender: deviceName,
                type: MessageType.NotebookSet,
                data: { key, value },
                group: null,
            };

            betterRadio.sendString(JSON.stringify(messagePacket));
            return;
        }

        groupsJoined.forEach(function (group) {
            const messagePacket: NotebookSetMessagePacket = {
                sender: deviceName,
                type: MessageType.NotebookSet,
                data: { key, value },
                group,
            };
            betterRadio.sendString(JSON.stringify(messagePacket));
        });
    }

    function notifyDelete(key: string) {
        if (groupsJoined.length === 0) {
            const messagePacket: NotebookDeleteMessagePacket = {
                sender: deviceName,
                type: MessageType.NotebookDelete,
                key,
                group: null,
            };

            betterRadio.sendString(JSON.stringify(messagePacket));
            return;
        }

        groupsJoined.forEach(function (group) {
            const messagePacket: NotebookDeleteMessagePacket = {
                sender: deviceName,
                type: MessageType.NotebookDelete,
                key,
                group,
            };
            betterRadio.sendString(JSON.stringify(messagePacket));
        });
    }

    function setValue(deviceName: string, key: string, value: string | number) {
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

    interface GroupMembers {
        [group: string]: string[];
    }

    const lonelyMembers: string[] = [];
    const groupMembers: GroupMembers = {};

    betterRadio.onReceivedString(function (receivedData) {
        const messagePacket: MessagePacket = JSON.parse(receivedData);

        if (messagePacket.type !== MessageType.NotebookSet) {
            return;
        }

        if (!groupsJoined.length && messagePacket.group === null) {
            setValue(messagePacket.sender, messagePacket.data.key, messagePacket.data.value);
            if (lonelyMembers.indexOf(messagePacket.sender) === -1) {
                lonelyMembers.push(messagePacket.sender);
            }
        }

        if (groupsJoined.indexOf(messagePacket.group) !== -1) {
            setValue(messagePacket.sender, messagePacket.data.key, messagePacket.data.value);
            if (!groupMembers[messagePacket.group]) {
                groupMembers[messagePacket.group] = [];
            }
            if (groupMembers[messagePacket.group].indexOf(messagePacket.sender) === -1) {
                groupMembers[messagePacket.group].push(messagePacket.sender);
            }
        }
    });

    betterRadio.onReceivedString(function (receivedData) {
        const messagePacket: MessagePacket = JSON.parse(receivedData);

        if (messagePacket.type !== MessageType.NotebookDelete) {
            return;
        }

        if (!groupsJoined.length && messagePacket.group === null) {
            deleteValue(messagePacket.sender, messagePacket.key);
        }

        if (groupsJoined.indexOf(messagePacket.group) !== -1) {
            deleteValue(messagePacket.sender, messagePacket.key);
        }
    });

    //% block="$key"
    //% blockId=string_key
    //% blockHidden=true shim=TD_ID
    //% key.fieldEditor="autocomplete" key.fieldOptions.decompileLiterals=true
    //% key.fieldOptions.key="string_keys"
    export function _stringKey(key: string) {
        return key;
    }

    //% block="en mi cuaderno, poner texto $key: $value"
    //% key.defl="clave" value.defl="valor"
    //% key.shadow=string_key
    //% weight=100 group="Mi cuaderno"
    export function setStringValue(key: string, value: string) {
        setValue(deviceName, key, value);
        notifySet(key, value);
    }

    //% block="de mi cuaderno, obtener texto $key"
    //% key.shadow=string_key
    //% weight=90 group="Mi cuaderno"
    export function getStringValue(key: string): string {
        const value = getValue(deviceName, key);
        if (typeof value === "string") {
            return value;
        }

        if (typeof value === "undefined") {
            return "";
        }

        return value.toString();
    }

    //% block="$key"
    //% blockId=number_key
    //% blockHidden=true shim=TD_ID
    //% key.fieldEditor="autocomplete" key.fieldOptions.decompileLiterals=true
    //% key.fieldOptions.key="number_keys"
    export function _numberKey(key: string) {
        return key;
    }

    //% block="en mi cuaderno, poner numero $key: $value"
    //% key.defl="clave"
    //% key.shadow=number_key
    //% weight=80 group="Mi cuaderno"
    export function setNumberValue(key: string, value: number) {
        setValue(deviceName, key, value);
        notifySet(key, value);
    }

    //% block="de mi cuaderno, obtener numero $key"
    //% key.shadow=number_key
    //% weight=70 group="Mi cuaderno"
    export function getNumberValue(key: string): number {
        const value = getValue(deviceName, key);
        if (typeof value === "number") {
            return value;
        }

        const converted = parseFloat(value);

        return isNaN(converted) ? 0 : converted;
    }

    //% block="en mi cuaderno, existe el texto $key"
    //% key.shadow=string_key
    //% weight=60 group="Mi cuaderno"
    export function hasStringKey(key: string): boolean {
        return typeof getValue(deviceName, key) === "string";
    }

    //% block="en mi cuaderno, existe el numero $key"
    //% key.shadow=number_key
    //% weight=50 group="Mi cuaderno"
    export function hasNumberKey(key: string): boolean {
        return typeof getValue(deviceName, key) === "number";
    }

    //% block="de mi cuaderno, borrar $key"
    //% weight=40 group="Mi cuaderno"
    export function deleteKey(key: string) {
        deleteValue(deviceName, key);
        notifyDelete(key);
    }

    //% block="del cuaderno de $deviceName, obtener texto $key"
    //% deviceName.shadow=device_field
    //% key.shadow=string_key
    //% weight=100 group="Cuadernos grupales"
    export function getStringValueFrom(deviceName: string, key: string): string {
        const value = getValue(deviceName, key);
        if (typeof value === "string") {
            return value;
        }

        if (typeof value === "undefined") {
            return "";
        }

        return value.toString();
    }

    //% block="del cuaderno de $deviceName, obtener numero $key"
    //% deviceName.shadow=device_field
    //% key.shadow=number_key
    //% weight=90 group="Cuadernos grupales"
    export function getNumberValueFrom(deviceName: string, key: string): number {
        const value = getValue(deviceName, key);
        if (typeof value === "number") {
            return value;
        }

        const converted = parseFloat(value);

        return isNaN(converted) ? 0 : converted;
    }

    //% block="del cuaderno de $device, al recibir un nuevo $valor de texto de $key"
    //% device.shadow=device_field key.shadow=string_key
    //% draggableParameters="reporter"
    //% weight=89 group="Cuadernos grupales"
    export function onStringUpdateFrom(device: string, key: string, handler: (valor: string) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);

            if (
                messagePacket.type === MessageType.NotebookSet &&
                messagePacket.sender === device &&
                messagePacket.data.key === key &&
                typeof messagePacket.data.value === "string" &&
                ((messagePacket.group === null && groupsJoined.length === 0) ||
                    (messagePacket.group !== null && groupsJoined.indexOf(messagePacket.group) !== -1))
            ) {
                handler(messagePacket.data.value);
            }
        });
    }

    //% block="del cuaderno de $device, al recibir un nuevo $valor numerico de $key"
    //% device.shadow=device_field key.shadow=number_key
    //% draggableParameters="reporter"
    //% weight=88 group="Cuadernos grupales"
    export function onNumberUpdateFrom(device: string, key: string, handler: (valor: number) => void) {
        betterRadio.onReceivedString(function (receivedString: string) {
            const messagePacket: MessagePacket = JSON.parse(receivedString);

            if (
                messagePacket.type === MessageType.NotebookSet &&
                messagePacket.sender === device &&
                messagePacket.data.key === key &&
                typeof messagePacket.data.value === "number" &&
                ((messagePacket.group === null && groupsJoined.length === 0) ||
                    (messagePacket.group !== null && groupsJoined.indexOf(messagePacket.group) !== -1))
            ) {
                handler(messagePacket.data.value);
            }
        });
    }

    //% block="en el cuaderno de $device, existe el texto $key"
    //% device.shadow=device_field
    //% key.shadow=string_key
    //% weight=87 group="Cuadernos grupales"
    export function hasStringKeyFrom(device: string, key: string): boolean {
        return typeof getValue(device, key) === "string";
    }

    //% block="en el cuaderno de $device, existe el numero $key"
    //% device.shadow=device_field
    //% key.shadow=number_key
    //% weight=86 group="Cuadernos grupales"
    export function hasNumberKeyFrom(device: string, key: string): boolean {
        return typeof getValue(device, key) === "number";
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

    function getNumberMemberValuesForKey(key: string, group?: string) {
        const members = (group ? groupMembers[group] : lonelyMembers) || [];
        const fullMembers = members.slice();

        if (groupsJoined.indexOf(group) !== -1 || (!group && !groupsJoined.length)) {
            fullMembers.push(deviceName);
        }

        const memberValues: { memberName: string; value: number }[] = [];

        fullMembers.forEach((member) => {
            let value = getValue(member, key);
            if (typeof value !== "number") {
                value = parseFloat(value);
                if (isNaN(value)) {
                    return;
                }
            }
            memberValues.push({ memberName: member, value: value });
        });

        return memberValues;
    }

    function getStringMemberValuesForKey(key: string, group?: string) {
        const members = (group ? groupMembers[group] : lonelyMembers) || [];
        const fullMembers = members.slice();

        if (groupsJoined.indexOf(group) !== -1 || (!group && !groupsJoined.length)) {
            fullMembers.push(deviceName);
        }

        const memberValues: { memberName: string; value: string }[] = [];

        fullMembers.forEach((member) => {
            let value = getValue(member, key);
            if (typeof value !== "string") {
                value = value.toString();
                if (!value) {
                    return;
                }
            }
            memberValues.push({ memberName: member, value: value });
        });

        return memberValues;
    }

    //% block="del cuaderno resumen, obtener $operation de $key || para el grupo $group"
    //% key.defl="clave"
    //% key.shadow=number_key group.shadow=group_field
    //% expandableArgumentMode="toggle"
    //% weight=80 group="Cuadernos grupales"
    export function getAggregateValueFrom(key: string, operation: Operation, group?: string): number {
        const memberValues = getNumberMemberValuesForKey(key, group);

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

    //% block="obtener dispositivo con $operation de $key || para el grupo $group"
    //% key.defl="clave"
    //% key.shadow=number_key group.shadow=group_field
    //% expandableArgumentMode="toggle"
    //% weight=75 group="Cuadernos grupales"
    export function getDeviceWithExtremaValue(key: string, operation: DeviceOperation, group?: string): string {
        const realOperation = operation === DeviceOperation.MAX ? Operation.MAX : Operation.MIN;
        const aggregateValue = getAggregateValueFrom(key, realOperation, group);

        const memberValues = getNumberMemberValuesForKey(key, group);
        for (const member of memberValues) {
            if (member.value === aggregateValue) {
                return member.memberName;
            }
        }

        return "";
    }

    //% block="obtener dispositivo con $key igual a $value || para el grupo $group"
    //% key.defl="clave"
    //% key.shadow=number_key group.shadow=group_field
    //% expandableArgumentMode="toggle"
    //% weight=74 group="Cuadernos grupales"
    export function getDeviceWithNumberValue(key: string, value: number, group?: string): string {
        const memberValues = getNumberMemberValuesForKey(key, group);
        for (const member of memberValues) {
            if (member.value === value) {
                return member.memberName;
            }
        }

        return "";
    }

    //% block="obtener dispositivo con $key igual a $value || para el grupo $group"
    //% key.defl="clave"
    //% key.shadow=string_key group.shadow=group_field
    //% expandableArgumentMode="toggle"
    //% weight=73 group="Cuadernos grupales"
    export function getDeviceWithStringValue(key: string, value: string, group?: string): string {
        const memberValues = getStringMemberValuesForKey(key, group);
        for (const member of memberValues) {
            if (member.value === value) {
                return member.memberName;
            }
        }

        return "";
    }

    //% block="para cada $dispositivo y $valor de texto de $key"
    //% key.defl="clave"
    //% key.shadow=string_key
    //% draggableParameters="reporter"
    //% handlerStatement
    //% weight=70 group="Cuadernos grupales"
    export function iterateOverStringKeyValues(key: string, handler: (dispositivo: string, valor: string) => void) {
        const memberValues = getStringMemberValuesForKey(key);

        memberValues.forEach((item) => {
            handler(item.memberName, item.value);
        });
    }

    //% block="para cada $dispositivo y $valor de texto de $key en el grupo $group"
    //% key.defl="clave"
    //% key.shadow=string_key group.shadow=group_field
    //% draggableParameters="reporter"
    //% handlerStatement
    //% weight=60 group="Cuadernos grupales"
    export function iterateOverStringKeyValuesGroup(
        key: string,
        group: string,
        handler: (dispositivo: string, valor: string) => void
    ): void {
        const memberValues = getStringMemberValuesForKey(key, group);

        memberValues.forEach((item) => {
            handler(item.memberName, item.value);
        });
    }

    //% block="para cada $dispositivo y $valor numerico de $key"
    //% key.defl="clave"
    //% key.shadow=number_key
    //% draggableParameters="reporter"
    //% handlerStatement
    //% weight=50 group="Cuadernos grupales"
    export function iterateOverNumberKeyValues(key: string, handler: (dispositivo: string, valor: number) => void) {
        const memberValues = getNumberMemberValuesForKey(key);

        memberValues.forEach((item) => {
            handler(item.memberName, item.value);
        });
    }

    //% block="para cada $dispositivo y $valor numerico de $key en el grupo $group"
    //% key.defl="clave"
    //% key.shadow=number_key group.shadow=group_field
    //% draggableParameters="reporter"
    //% handlerStatement
    //% weight=40 group="Cuadernos grupales"
    export function iterateOverNumberKeyValuesGroup(
        key: string,
        group: string,
        handler: (dispositivo: string, valor: number) => void
    ): void {
        const memberValues = getNumberMemberValuesForKey(key, group);

        memberValues.forEach((item) => {
            handler(item.memberName, item.value);
        });
    }

    const sharedNotebook: Notebook = {};
    const lonelySharedNotebook: SimpleNotebook = {};

    function notifySetShared(key: string, value: string | number, group?: string) {
        const messagePacket: NotebookSetSharedMessagePacket = {
            sender: deviceName,
            type: MessageType.NotebookSetShared,
            data: { key, value },
            group: group || null,
        };

        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    function notifyDeleteShared(key: string, group?: string) {
        const messagePacket: NotebookDeleteSharedMessagePacket = {
            sender: deviceName,
            type: MessageType.NotebookDeleteShared,
            key,
            group: group || null,
        };

        betterRadio.sendString(JSON.stringify(messagePacket));
    }

    function setValueShared(key: string, value: string | number, group?: string) {
        if ((group && groupsJoined.indexOf(group) === -1) || (!group && groupsJoined.length > 0)) {
            return;
        }

        if (group) {
            if (!sharedNotebook[group]) {
                sharedNotebook[group] = {};
            }
            sharedNotebook[group][key] = value;
        } else {
            lonelySharedNotebook[key] = value;
        }

        notifySetShared(key, value, group);
    }

    function getValueShared(key: string, group?: string) {
        return group ? sharedNotebook[group] && sharedNotebook[group][key] : lonelySharedNotebook[key];
    }

    function deleteValueShared(key: string, group?: string) {
        if ((group && groupsJoined.indexOf(group) === -1) || (!group && groupsJoined.length > 0)) {
            return;
        }

        if (group) {
            if (!sharedNotebook[group]) {
                return;
            }
            delete sharedNotebook[group][key];
        } else {
            delete lonelySharedNotebook[key];
        }

        notifyDeleteShared(key, group);
    }

    betterRadio.onReceivedString(function (receivedData) {
        const messagePacket: MessagePacket = JSON.parse(receivedData);

        if (messagePacket.type !== MessageType.NotebookSetShared) {
            return;
        }

        if (!groupsJoined.length && messagePacket.group === null) {
            lonelySharedNotebook[messagePacket.data.key] = messagePacket.data.value;
        }

        if (groupsJoined.indexOf(messagePacket.group) !== -1) {
            if (!sharedNotebook[messagePacket.group]) {
                sharedNotebook[messagePacket.group] = {};
            }
            sharedNotebook[messagePacket.group][messagePacket.data.key] = messagePacket.data.value;
        }
    });

    betterRadio.onReceivedString(function (receivedData) {
        const messagePacket: MessagePacket = JSON.parse(receivedData);

        if (messagePacket.type !== MessageType.NotebookDeleteShared) {
            return;
        }

        if (!groupsJoined.length && messagePacket.group === null) {
            delete lonelySharedNotebook[messagePacket.key];
        }

        if (groupsJoined.indexOf(messagePacket.group) !== -1) {
            if (!sharedNotebook[messagePacket.group]) {
                return;
            }
            delete sharedNotebook[messagePacket.group][messagePacket.key];
        }
    });

    //% block="$key"
    //% blockId=string_key_shared
    //% blockHidden=true shim=TD_ID
    //% key.fieldEditor="autocomplete" key.fieldOptions.decompileLiterals=true
    //% key.fieldOptions.key="string_keys_shared"
    export function _stringKeyShared(key: string) {
        return key;
    }

    //% block="$key"
    //% blockId=number_key_shared
    //% blockHidden=true shim=TD_ID
    //% key.fieldEditor="autocomplete" key.fieldOptions.decompileLiterals=true
    //% key.fieldOptions.key="number_keys_shared"
    export function _numberKeyShared(key: string) {
        return key;
    }

    //% block="en el cuaderno compartido, poner texto $key: $value || para el grupo $group"
    //% key.defl="clave" value.defl="valor"
    //% key.shadow=string_key_shared
    //% group.shadow=group_field
    //% weight=30 group="Cuadernos grupales"
    export function setStringValueShared(key: string, value: string, group?: string) {
        setValueShared(key, value, group);
    }

    //% block="del cuaderno compartido, obtener texto $key || para el grupo $group"
    //% key.shadow=string_key_shared
    //% group.shadow=group_field
    //% weight=20 group="Cuadernos grupales"
    export function getStringValueShared(key: string, group?: string): string {
        const value = getValueShared(key, group);
        if (typeof value === "string") {
            return value;
        }

        if (typeof value === "undefined") {
            return "";
        }

        return value.toString();
    }

    //% block="en el cuaderno compartido, poner numero $key: $value || para el grupo $group"
    //% key.defl="clave" value.defl="valor"
    //% key.shadow=number_key_shared
    //% group.shadow=group_field
    //% weight=10 group="Cuadernos grupales"
    export function setNumberValueShared(key: string, value: number, group?: string) {
        setValueShared(key, value, group);
    }

    //% block="del cuaderno compartido, obtener numero $key || para el grupo $group"
    //% key.shadow=number_key_shared
    //% group.shadow=group_field
    //% weight=5 group="Cuadernos grupales"
    export function getNumberValueShared(key: string, group?: string): number {
        const value = getValueShared(key, group);
        if (typeof value === "number") {
            return value;
        }

        const converted = parseFloat(value);

        return isNaN(converted) ? 0 : converted;
    }

    //% block="en el cuaderno compartido, existe el texto $key || para el grupo $group"
    //% key.shadow=string_key_shared
    //% group.shadow=group_field
    //% weight=4 group="Cuadernos grupales"
    export function hasStringKeyShared(key: string, group?: string): boolean {
        return typeof getValueShared(key, group) === "string";
    }

    //% block="en el cuaderno compartido, existe el numero $key || para el grupo $group"
    //% key.shadow=number_key_shared
    //% group.shadow=group_field
    //% weight=3 group="Cuadernos grupales"
    export function hasNumberKeyShared(key: string, group?: string): boolean {
        return typeof getValueShared(key, group) === "number";
    }

    //% block="del cuaderno compartido, borrar $key || para el grupo $group"
    //% group.shadow=group_field
    //% weight=2 group="Cuadernos grupales"
    export function deleteKeyShared(key: string, group?: string) {
        deleteValueShared(key, group);
    }
}

