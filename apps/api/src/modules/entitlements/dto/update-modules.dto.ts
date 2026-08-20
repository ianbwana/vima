import { IsArray, IsString, ArrayUnique, IsIn } from 'class-validator';

const VALID_MODULES = ['rides', 'food', 'groceries', 'courier', 'home_services'];

export class UpdateModulesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @IsIn(VALID_MODULES, { each: true })
  modules: string[];
}
