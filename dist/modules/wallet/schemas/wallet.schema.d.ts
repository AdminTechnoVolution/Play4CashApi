import { Document } from 'mongoose';
export type WalletDocument = WalletEntry & Document;
export declare class WalletEntry {
    coin: string;
    address: string;
    red: string;
    description: string;
    minAmount: number;
    networkWithdrawalFee: number;
    isActive: boolean;
}
export declare const WalletSchema: import("mongoose").Schema<WalletEntry, import("mongoose").Model<WalletEntry, any, any, any, any, any, WalletEntry>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, WalletEntry, Document<unknown, {}, WalletEntry, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<WalletEntry & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    coin?: import("mongoose").SchemaDefinitionProperty<string, WalletEntry, Document<unknown, {}, WalletEntry, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletEntry & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    address?: import("mongoose").SchemaDefinitionProperty<string, WalletEntry, Document<unknown, {}, WalletEntry, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletEntry & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    red?: import("mongoose").SchemaDefinitionProperty<string, WalletEntry, Document<unknown, {}, WalletEntry, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletEntry & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string, WalletEntry, Document<unknown, {}, WalletEntry, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletEntry & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    minAmount?: import("mongoose").SchemaDefinitionProperty<number, WalletEntry, Document<unknown, {}, WalletEntry, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletEntry & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    networkWithdrawalFee?: import("mongoose").SchemaDefinitionProperty<number, WalletEntry, Document<unknown, {}, WalletEntry, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletEntry & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    isActive?: import("mongoose").SchemaDefinitionProperty<boolean, WalletEntry, Document<unknown, {}, WalletEntry, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletEntry & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, WalletEntry>;
