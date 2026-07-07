import { Document } from 'mongoose';
export type AppConfigDocument = AppConfig & Document;
export declare class AppConfig {
    key: string;
    withdrawal_daily_limit: number;
}
export declare const AppConfigSchema: import("mongoose").Schema<AppConfig, import("mongoose").Model<AppConfig, any, any, any, any, any, AppConfig>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AppConfig, Document<unknown, {}, AppConfig, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<AppConfig & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    key?: import("mongoose").SchemaDefinitionProperty<string, AppConfig, Document<unknown, {}, AppConfig, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppConfig & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    withdrawal_daily_limit?: import("mongoose").SchemaDefinitionProperty<number, AppConfig, Document<unknown, {}, AppConfig, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<AppConfig & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, AppConfig>;
