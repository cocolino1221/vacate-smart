import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsInt, IsNumber, IsOptional, IsString,
  Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class GuestRoomDto {
  @IsInt() @Min(1) @Max(6)
  adults: number;

  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsInt({ each: true }) @Min(0, { each: true }) @Max(17, { each: true })
  children?: number[];
}

export class StayDto {
  @Matches(DATE) checkin: string;
  @Matches(DATE) checkout: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6)
  @ValidateNested({ each: true }) @Type(() => GuestRoomDto)
  guests: GuestRoomDto[];

  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() @Length(2, 2) residency?: string;
  @IsOptional() @IsString() @Length(2, 5) language?: string;
}

export class HotelSearchDto extends StayDto {
  @IsOptional() @IsInt() regionId?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(300) @IsInt({ each: true })
  hids?: number[];

  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsInt() @Min(100) @Max(70000) radius?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsInt() @Min(0) offset?: number;
}

export class TravellerDto {
  @IsString() @Length(1, 60) firstName: string;
  @IsString() @Length(1, 60) lastName: string;
  @IsOptional() @IsBoolean() isChild?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(17) age?: number;
}

export class RoomTravellersDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => TravellerDto)
  guests: TravellerDto[];
}

export class CustomerDto {
  @IsString() @Length(1, 60) firstName: string;
  @IsString() @Length(1, 60) lastName: string;
  @IsEmail() email: string;
  @IsString() @Matches(/^\+?[0-9 ()-]{7,20}$/) phone: string;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

export class CreateHotelOrderDto {
  /** book_hash primit din /hotels/:hid/rates */
  @IsString() @Length(1, 400) bookHash: string;
  @IsInt() hid: number;
  @Matches(DATE) checkin: string;
  @Matches(DATE) checkout: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => RoomTravellersDto)
  rooms: RoomTravellersDto[];

  @ValidateNested() @Type(() => CustomerDto)
  customer: CustomerDto;

  @IsOptional() @IsString() @Length(2, 5) language?: string;
}
