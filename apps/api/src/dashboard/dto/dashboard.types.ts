import { ObjectType, Field, Float } from "@nestjs/graphql";

@ObjectType()
export class AllocationItemType {
  @Field()
  category!: string;

  @Field(() => Float)
  valueInBase!: number;

  @Field(() => Float)
  percentage!: number;
}

@ObjectType()
export class SnapshotPointType {
  @Field()
  date!: string;

  @Field(() => Float)
  netWorth!: number;
}

@ObjectType()
export class DashboardSummaryType {
  @Field(() => Float)
  totalNetWorth!: number;

  @Field(() => Float)
  todayChangeAbs!: number;

  @Field(() => Float)
  todayChangePct!: number;

  @Field(() => Float)
  monthChangeAbs!: number;

  @Field(() => Float)
  monthChangePct!: number;

  @Field(() => Float)
  yearChangeAbs!: number;

  @Field(() => Float)
  yearChangePct!: number;

  @Field(() => [AllocationItemType])
  assetAllocation!: AllocationItemType[];

  @Field(() => Float)
  emergencyFundHealth!: number;

  @Field(() => Float)
  debtRatio!: number;

  @Field(() => [SnapshotPointType])
  snapshots!: SnapshotPointType[];

  @Field()
  hasAssets!: boolean;

  @Field()
  baseCurrency!: string;
}
