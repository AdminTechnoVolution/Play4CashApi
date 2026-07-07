import { Document, Types } from 'mongoose';
export type WalletChangePendingDocument = WalletChangePending & Document;
export declare class WalletChangePending {
    user_id: Types.ObjectId;
    coin: string;
    network: string;
    wallet: string;
    verification_code: string;
    verification_expires_at: Date;
}
export declare const WalletChangePendingSchema: import("mongoose").Schema<WalletChangePending, import("mongoose").Model<WalletChangePending, any, any, any, any, any, WalletChangePending>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, WalletChangePending, Document<unknown, {}, WalletChangePending, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<WalletChangePending & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, WalletChangePending, Document<unknown, {}, WalletChangePending, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletChangePending & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    coin?: import("mongoose").SchemaDefinitionProperty<string, WalletChangePending, Document<unknown, {}, WalletChangePending, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletChangePending & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    network?: import("mongoose").SchemaDefinitionProperty<string, WalletChangePending, Document<unknown, {}, WalletChangePending, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletChangePending & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    wallet?: import("mongoose").SchemaDefinitionProperty<string, WalletChangePending, Document<unknown, {}, WalletChangePending, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletChangePending & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    verification_code?: import("mongoose").SchemaDefinitionProperty<string, WalletChangePending, Document<unknown, {}, WalletChangePending, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletChangePending & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    verification_expires_at?: import("mongoose").SchemaDefinitionProperty<Date, WalletChangePending, Document<unknown, {}, WalletChangePending, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<WalletChangePending & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, WalletChangePending>;
