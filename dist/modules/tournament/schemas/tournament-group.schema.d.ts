import { Document, Types } from 'mongoose';
export type TournamentGroupDocument = TournamentGroup & Document;
export declare class TournamentGroup {
    tournament_id: Types.ObjectId;
    group_number: number;
    status: string;
    winner_user_id?: Types.ObjectId;
}
export declare const TournamentGroupSchema: import("mongoose").Schema<TournamentGroup, import("mongoose").Model<TournamentGroup, any, any, any, any, any, TournamentGroup>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TournamentGroup, Document<unknown, {}, TournamentGroup, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<TournamentGroup & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    tournament_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, TournamentGroup, Document<unknown, {}, TournamentGroup, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentGroup & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    group_number?: import("mongoose").SchemaDefinitionProperty<number, TournamentGroup, Document<unknown, {}, TournamentGroup, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentGroup & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<string, TournamentGroup, Document<unknown, {}, TournamentGroup, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentGroup & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    winner_user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, TournamentGroup, Document<unknown, {}, TournamentGroup, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TournamentGroup & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, TournamentGroup>;
