import { Document, Types } from 'mongoose';
import { LanguageField } from '../../game/schemas/game.schema';
import { TournamentPhase, TournamentStatus } from '../constants/tournament.constants';
export type TournamentDocument = Tournament & Document;
export declare class Tournament {
    title: LanguageField;
    description: LanguageField;
    game_id: Types.ObjectId;
    game_socket_code: string;
    status: TournamentStatus;
    buy_in: number;
    max_players: number;
    min_players: number;
    group_count: number;
    group_size: number;
    registered_count: number;
    starts_at: Date;
    registration_opens_at?: Date;
    registration_closes_at?: Date;
    house_fee_percent: number;
    first_place_percent: number;
    second_place_percent: number;
    gross_prize_pool: number;
    house_amount: number;
    first_place_amount: number;
    second_place_amount: number;
    winner_user_id?: Types.ObjectId;
    runner_up_user_id?: Types.ObjectId;
    turn_timer_seconds: number;
    between_rounds_pause_seconds: number;
    presence_window_seconds: number;
    rematch_delay_seconds: number;
    bracket_seed?: string;
    current_phase: TournamentPhase;
    current_round_index: number;
    between_rounds_ends_at?: Date;
    presence_window_ends_at?: Date;
    prizes_settled: boolean;
    finished_at?: Date;
}
export declare const TournamentSchema: import("mongoose").Schema<Tournament, import("mongoose").Model<Tournament, any, any, any, any, any, Tournament>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Tournament, Document<unknown, {}, Tournament, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    title?: import("mongoose").SchemaDefinitionProperty<LanguageField, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<LanguageField, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    game_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    game_socket_code?: import("mongoose").SchemaDefinitionProperty<string, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<TournamentStatus, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    buy_in?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    max_players?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    min_players?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    group_count?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    group_size?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    registered_count?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    starts_at?: import("mongoose").SchemaDefinitionProperty<Date, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    registration_opens_at?: import("mongoose").SchemaDefinitionProperty<Date | undefined, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    registration_closes_at?: import("mongoose").SchemaDefinitionProperty<Date | undefined, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    house_fee_percent?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    first_place_percent?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    second_place_percent?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    gross_prize_pool?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    house_amount?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    first_place_amount?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    second_place_amount?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    winner_user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    runner_up_user_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    turn_timer_seconds?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    between_rounds_pause_seconds?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    presence_window_seconds?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    rematch_delay_seconds?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    bracket_seed?: import("mongoose").SchemaDefinitionProperty<string | undefined, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    current_phase?: import("mongoose").SchemaDefinitionProperty<TournamentPhase, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    current_round_index?: import("mongoose").SchemaDefinitionProperty<number, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    between_rounds_ends_at?: import("mongoose").SchemaDefinitionProperty<Date | undefined, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    presence_window_ends_at?: import("mongoose").SchemaDefinitionProperty<Date | undefined, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    prizes_settled?: import("mongoose").SchemaDefinitionProperty<boolean, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    finished_at?: import("mongoose").SchemaDefinitionProperty<Date | undefined, Tournament, Document<unknown, {}, Tournament, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Tournament & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Tournament>;
