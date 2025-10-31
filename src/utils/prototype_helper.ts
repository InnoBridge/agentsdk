const copyPrototypeChain = (
    sourceProto: object,
    targetProto: object,
    stopProto: object
) => {
    const visited = new Set<string>();
    let proto: any = sourceProto;

    while (proto && proto !== stopProto && proto !== Object.prototype) {
        for (const name of Object.getOwnPropertyNames(proto)) {
            if (name === 'constructor') continue;
            if (visited.has(name)) continue;

            const descriptor = Object.getOwnPropertyDescriptor(proto, name);
            if (!descriptor) continue;

            if (!Object.prototype.hasOwnProperty.call(targetProto, name)) {
                Object.defineProperty(targetProto, name, descriptor);
            }

            visited.add(name);
        }

        proto = Object.getPrototypeOf(proto);
    }
};

export { copyPrototypeChain };
