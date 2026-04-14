import { SetMetadata } from '@nestjs/common';
import { AppAbility } from './casl-ability.factory';

// Each handler receives the built ability and returns true if the check passes
export type PolicyHandler = (ability: AppAbility) => boolean;

export const CHECK_POLICIES_KEY = 'check_policies';

/**
 * Attach one or more policy checks to a route handler.
 * All handlers must return true for the request to proceed.
 *
 * @example
 * @CheckPolicies((ability) => ability.can('create', 'VolunteerPlan'))
 */
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
