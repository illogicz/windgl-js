declare interface ObjectConstructor {
    keys<T>(o: T): T extends object ? (keyof T)[] : never;
    entries<T>(o: T): T extends object ? Entry<T>[] : never;
}

type Entry<T> = [P, NonNullable<T[P]>];