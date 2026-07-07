import { Document, Schema as MongooseSchema, Types } from 'mongoose';
export type UnoGameDocument = UnoGame & Document;
export declare class UnoGame {
    room_id: Types.ObjectId;
    player_ids: Types.ObjectId[];
    hands: Map<string, string[]>;
    draw_pile: string[];
    discard_pile: string[];
    current_player_index: number;
    direction: number;
    current_color: string;
    draw_stack_pending: number;
    eliminated_players: string[];
    turn_start_time: Date;
    uno_called: string[];
    pending_uno_offender: string | null;
    last_action_player_id: string | null;
    match_scores: Map<string, number>;
    round_number: number;
    match_target_score: number;
    match_winner_id: string | null;
    between_rounds: boolean;
    next_round_starts_at: Date | null;
    between_rounds_processing: boolean;
    players_ready_for_next: string[];
    round_history: {
        round: number;
        winnerId: string;
        scoreDealt: number;
        endedAt: Date;
    }[];
}
export declare const UnoGameSchema: MongooseSchema<UnoGame, import("mongoose").Model<UnoGame, any, any, any, any, any, UnoGame>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, UnoGame, Document<unknown, {}, UnoGame, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    room_id?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    player_ids?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId[], UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    hands?: import("mongoose").SchemaDefinitionProperty<Map<string, string[]>, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    draw_pile?: import("mongoose").SchemaDefinitionProperty<string[], UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    discard_pile?: import("mongoose").SchemaDefinitionProperty<string[], UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    current_player_index?: import("mongoose").SchemaDefinitionProperty<number, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    direction?: import("mongoose").SchemaDefinitionProperty<number, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    current_color?: import("mongoose").SchemaDefinitionProperty<string, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    draw_stack_pending?: import("mongoose").SchemaDefinitionProperty<number, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    eliminated_players?: import("mongoose").SchemaDefinitionProperty<string[], UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    turn_start_time?: import("mongoose").SchemaDefinitionProperty<Date, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    uno_called?: import("mongoose").SchemaDefinitionProperty<string[], UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    pending_uno_offender?: import("mongoose").SchemaDefinitionProperty<string | null, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    last_action_player_id?: import("mongoose").SchemaDefinitionProperty<string | null, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    match_scores?: import("mongoose").SchemaDefinitionProperty<Map<string, number>, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    round_number?: import("mongoose").SchemaDefinitionProperty<number, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    match_target_score?: import("mongoose").SchemaDefinitionProperty<number, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    match_winner_id?: import("mongoose").SchemaDefinitionProperty<string | null, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    between_rounds?: import("mongoose").SchemaDefinitionProperty<boolean, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    next_round_starts_at?: import("mongoose").SchemaDefinitionProperty<Date | null, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    between_rounds_processing?: import("mongoose").SchemaDefinitionProperty<boolean, UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    players_ready_for_next?: import("mongoose").SchemaDefinitionProperty<string[], UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    round_history?: import("mongoose").SchemaDefinitionProperty<{
        round: number;
        winnerId: string;
        scoreDealt: number;
        endedAt: Date;
    }[], UnoGame, Document<unknown, {}, UnoGame, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UnoGame & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, UnoGame>;
