# Extension de Cuaderno para MakeCode y Micro:bit

La extension "Cuaderno" introduce una abstraccion intuitiva de un cuaderno distribuido entre multiples dispositivos Micro:bit, permitiendo a los estudiantes y educadores explorar conceptos de programacion distribuida y colaboracion en proyectos educativos.

## Uso como Extension

Esta extension se puede agregar a tu proyecto MakeCode de la siguiente manera:

-   Abre [https://makecode.microbit.org/](https://makecode.microbit.org/)
-   Crea un **Nuevo Proyecto**
-   Accede a **Extensiones** desde el menu de configuracion (icono de rueda dentada)
-   Busca **https://github.com/romanrguez192/notebook** e importa

## Editar este Proyecto

Para editar este repositorio en MakeCode, sigue estos pasos:

-   Ve a [https://makecode.microbit.org/](https://makecode.microbit.org/)
-   Selecciona **Importar** y luego **Importar URL**
-   Pega **https://github.com/romanrguez192/notebook** y haz clic en importar

## Bloques Disponibles

La extension "Cuaderno" proporciona una serie de bloques organizados en categorias para facilitar la interaccion con el cuaderno distribuido. A continuacion, se presentan los bloques disponibles con ejemplos de uso.

### Configuracion

#### Establecer Canal de Comunicacion

```blocks
notebook.setChannel(1)
```

Configura el canal de comunicacion (0-255) para evitar interferencias con otros proyectos.

#### Registrar Dispositivo con Nombre

```blocks
notebook.registerDevice("Alice")
```

Asigna un nombre unico a tu dispositivo para facilitar su identificacion en la red.

#### Establecer Mi Grupo

```blocks
notebook.setGroup("Cientificos jovenes")
```

Define el grupo al que pertenece tu dispositivo para colaborar en un cuaderno compartido.

### Mi Hoja

#### Escribir Clave = Valor

```blocks
notebook.setMyValue("temperatura", 23)
```

Asigna un valor a una clave especifica en tu hoja del cuaderno.

#### Leer Valor de Clave

```blocks
let valor = notebook.getMyValue("temperatura")
```

Recupera el valor asociado a una clave en tu hoja.

#### Verificar Existencia de Clave

```blocks
if (notebook.doesMyKeyExist("temperatura")) {
}
```

Comprueba si una clave especifica existe en tu hoja.

#### Borrar Clave

```blocks
notebook.deleteMyKey("temperatura")
```

Elimina una clave y su valor asociado de tu hoja.

### Hojas de Mi Grupo

#### Leer Valor de Clave en Hoja de Otro

```blocks
let valor = notebook.getValueFrom("Bob", "temperatura")
```

Obtiene el valor de una clave en la hoja de otro dispositivo en tu grupo.

#### Reaccionar a Nuevo Valor de Clave

```blocks
notebook.onUpdateFrom("Bob", "temperatura", function(valor) {
})
```

Ejecuta codigo cuando se actualiza el valor de una clave en la hoja de otro dispositivo.

#### Esperar Valor Especifico de Clave

```blocks
notebook.onValueFrom("Bob", "temperatura", 30, function() {
})
```

Actua cuando el valor de una clave en la hoja de otro dispositivo coincide con el esperado.

#### Verificar Existencia de Clave en Otro

```blocks
if (notebook.doesKeyExistFrom("Bob", "temperatura")) {
}
```

Determina si una clave especifica existe en la hoja de otro dispositivo en tu grupo.

#### Operaciones Agregadas

```blocks
let maximo = notebook.getAggregateValueFrom("temperatura", notebook.Operation.MAX)
let minimo = notebook.getAggregateValueFrom("temperatura", notebook.Operation.MIN)
let suma = notebook.getAggregateValueFrom("temperatura", notebook.Operation.SUM)
let promedio = notebook.getAggregateValueFrom("temperatura", notebook.Operation.AVG)
```

Obtiene un valor agregado (maximo, minimo, suma, promedio) de una clave entre todas las hojas del grupo.

#### Encontrar Dispositivo con Valor Extremo

```blocks
let dispositivo1 = notebook.getDeviceWithExtremaValue("temperatura", Devicenotebook.Operation.MAX)
let dispositivo2 = notebook.getDeviceWithExtremaValue("temperatura", Devicenotebook.Operation.MIN)
```

Identifica el dispositivo con el valor maximo o minimo para una clave especifica en el grupo.

#### Encontrar Dispositivo con Valor Especifico

```blocks
let dispositivo = notebook.getDeviceWithValue("temperatura", 30)
```

Localiza el dispositivo que tiene un valor especifico

para una clave en el grupo.

#### Iterar Sobre Valores de Clave

```blocks
notebook.iterateOverStringKeyValues("temperatura", function(dispositivo, valor) {
})
```

Itera sobre todos los dispositivos y sus valores asociados a una clave en el grupo.

### Hoja Compartida

#### Escribir en Hoja Compartida

```blocks
notebook.setValueShared("humedad", 50)
```

Asigna un valor a una clave en la hoja compartida accesible por todos en el grupo.

#### Leer de Hoja Compartida

```blocks
let valor = notebook.getValueShared("humedad")
```

Obtiene el valor de una clave en la hoja compartida del grupo.

#### Verificar Existencia en Hoja Compartida

```blocks
if (notebook.doesKeyExistShared("humedad")) {
}
```

Comprueba si una clave especifica existe en la hoja compartida del grupo.

#### Borrar de Hoja Compartida

```blocks
notebook.deleteKeyShared("humedad")
```

Elimina una clave y su valor asociado de la hoja compartida del grupo.

#### Reaccionar a Actualizacion en Hoja Compartida

```blocks
notebook.onUpdateShared("humedad", function(valor) {
})
```

Actua cuando se actualiza el valor de una clave en la hoja compartida del grupo.

#### Esperar Valor Especifico en Hoja Compartida

```blocks
notebook.onValueShared("humedad", 50, function() {
})
```

Ejecuta acciones cuando el valor de una clave en la hoja compartida coincide con el esperado.

#### Metadatos (utilizados para busqueda, renderizado)

-   for PXT/microbit
<script src="https://makecode.com/gh-pages-embed.js"></script><script>makeCodeRender("{{ site.makecode.home_url }}", "{{ site.github.owner_name }}/{{ site.github.repository_name }}");</script>
