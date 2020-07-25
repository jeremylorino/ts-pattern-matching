import {
    match,
    Dictionary,
    DictionaryRecord,
    Pattern,
    InvertPattern,
    ListUpperBound,
    Fun,
    match_pattern,
} from "./main";

type FieldType =
    | "boolean"
    | "string"
    | "integer"
    | "time"
    | "date"
    | "timestamp"
    | "duration"
    | "real"
    | "decimal"
    | "percent"
    | "length"
    | "list"
    | "image"
    | "usdollars"
    | "phonenumber"
    | "map";
type Primitive = string | boolean | number;
type Computed<T = any> = () => T;

interface FieldMetadataObject {
    name?: string;
    label?: string;
    required?: boolean;
    type?: FieldType | null;
    collectionName?: string;
}
interface ItemMetadata {
    identifierName?: string;
    fields: FieldMetadataObject[];
    collection?: string;
}

function isObject(obj: any): obj is Function | Dictionary {
    const type = typeof obj;
    return type === "function" || (type === "object" && !!obj);
}

function mapObject<T, U>(
    object: Dictionary<T>,
    iteratee: (val: T, key: string, object: Dictionary<T>) => U,
    context?: any
) {
    return Object.entries(object).reduce((results, [k, v]) => {
        results[k] = iteratee(v, k, object);
        return results;
    }, {} as Dictionary<U>);
}

interface FieldMap<ValueType> {
    name: Computed<string | null>;
    value: Computed<ValueType>;
}

class Field<ValueType = any> implements FieldMap<ValueType> {
    public metadata: FieldMetadataObject | null;
    public value: Computed<ValueType>;
    public name: Computed<string | null>;
    public displayValue: Computed<string>;
    public label: Computed<string | null>;

    constructor(value?: any, metadata?: FieldMetadataObject) {
        this.value = () => value ?? null;
        this.metadata = metadata;
        this.displayValue = () => value;

        if (this.metadata) {
            this.name = () => this.metadata.name;
            this.label = () => this.metadata.label ?? this.metadata.name;
        } else {
            this.name = () => null;
            this.label = () => null;
        }
    }
}

class Item {
    _basis: Dictionary = {};
    _metadata: ItemMetadata = { fields: [] };
    _fields: Field[] = [];

    constructor(basis: Dictionary, metadata?: ItemMetadata) {
        this._basis = basis;
        this._metadata = {
            ...this._metadata,
            ...(metadata ?? {}),
        };

        this._fields = Object.entries(this._basis).map(([k, v]) => {
            const fieldMetadata = this._metadata.fields.find(m => m.name === k) ?? {
                name: k,
            };
            return new Field(v, fieldMetadata);
        });
    }

    public fields() {
        return this._fields;
    }

    public field<T = any>(name: string) {
        const field = this.findFieldByMetadata<T>(name);
        if (!field) {
            throw new Error(`There is no field [${name}] for this item`);
        }
        return field;
    }

    private findFieldByMetadata<T = any>(name: string) {
        return this.fields().find(f => f.metadata && f.metadata.name === name) as Field<T> | undefined;
    }

    private _getJSON<T>(node: Item | T[] | Dictionary | Primitive) {
        if (Array.isArray(node)) {
            return node.map(v => this._getJSON(v));
        } else if (node instanceof Item) {
            let json: Dictionary = {};
            node.fields().forEach(f => {
                json[f.name()] = this._getJSON(node.field(f.name()).value());
            });
            return json;
        } else if (isObject(node)) {
            return mapObject(node, v => this._getJSON(v));
        } else {
            return node;
        }
    }

    public toJSON(): Dictionary {
        return this._getJSON(this);
    }
}

const fieldMetadata: Dictionary<FieldMetadataObject> = {
    Make: {
        name: "Make",
        type: "string",
    },
    Model: {
        name: "Model",
        type: "string",
    },
    Year: {
        name: "Year",
        type: "integer",
    },
};

const items = [
    new Item(
        {
            Make: "BMW",
            Model: "M3",
            Year: 2007,
        },
        {
            fields: Object.values(fieldMetadata),
        }
    ),
    new Item(
        {
            Make: "BMW",
            Model: "M4",
            Year: 2007,
        },
        {
            fields: Object.values(fieldMetadata),
        }
    ),
    new Item(
        {
            Make: "Honda",
            Model: "Civic",
            Year: 2010,
        },
        {
            fields: Object.values(fieldMetadata),
        }
    ),
];

// console.log(items);

// const result1 = match(items[0])
//     .with({ field: { Make: "BMW" } }, o => o.fields())
//     .run();
const result2 = items
    .map(v =>
        match(v)
            .withWhen(
                { field: { Make: "BMW" } },
                o =>
                    !!match(o)
                        .with({ field: { Year: 2007 } }, o => o)
                        .run(),
                o => o
            )
            .run()
    )
    .filter(v => v);

// console.log(result1);
console.log(result2);
