import { deepmerge } from 'deepmerge-ts'

import type {
	RecursivelyExpandSelection,
	SelectionContext,
	SelectionDefinition,
} from '~/types/selections.js'
import type { Promisable, UnionToIntersection } from '~/types/type-fest.js'

type ExpandSelections<
	SelectionMappings extends Record<string, Record<string, unknown>>
> = {
	[Key in keyof SelectionMappings]: RecursivelyExpandSelection<
		SelectionMappings,
		SelectionMappings[Key]
	>
}

export function expandSelections<
	SelectionMapping extends Record<string, Record<string, unknown>>
>(selectionMapping: SelectionMapping): ExpandSelections<SelectionMapping> {
	function expandInnerSelection(mapping: Record<string, unknown>): void {
		for (const mappingKey of Object.keys(mapping)) {
			if (mappingKey.startsWith('$')) {
				expandInnerSelection(selectionMapping[mappingKey] ?? {})
				Object.assign(mapping, selectionMapping[mappingKey])
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete mapping[mappingKey]
			}
		}
	}

	for (const topLevelMappingValue of Object.values(selectionMapping)) {
		expandInnerSelection(topLevelMappingValue)
	}

	return selectionMapping as any
}

export function createSelectionFunction<
	Definition extends SelectionDefinition<any, any>
>(selectionDefinition: Definition) {
	type PrismaSelect = Definition extends SelectionDefinition<
		infer PrismaSelect,
		any
	>
		? PrismaSelect
		: never
	type SelectionMappings = Definition extends SelectionDefinition<
		any,
		infer SelectionMappings
	>
		? SelectionMappings
		: never

	type ExpandedSelections = ExpandSelections<SelectionMappings>

	const expandedSelections = expandSelections(selectionDefinition as any)

	return function select<
		Selections extends PrismaSelect & {
			[K in keyof SelectionMappings]?: boolean | undefined
		}
	>(
		selections: Selections
	): UnionToIntersection<
		{
			[SelectionKey in keyof Selections]: SelectionKey extends `$${string}`
				? ExpandedSelections[SelectionKey]
				: Record<SelectionKey, Selections[SelectionKey]>
		}[keyof Selections]
	> {
		const selectionsArray = []

		for (const [selectionKey, selectionValue] of Object.entries(selections)) {
			if (selectionKey.startsWith('$')) {
				selectionsArray.push((expandedSelections as any)[selectionKey])
			} else {
				selectionsArray.push({ [selectionKey]: selectionValue })
			}
		}

		return deepmerge(...selectionsArray) as any
	}
}

/**
	Creates a type-safe wrapper function for defining selections for Prisma `include`s.
*/
export function defineSelectionMappings<
	PrismaSelect extends Record<string, unknown>
>(): {
	set<
		SelectionMappings extends Record<
			`$${string}`,
			PrismaSelect & { [K in keyof SelectionMappings]?: boolean }
		>
	>(
		mappings: (context: SelectionContext) => Promisable<SelectionMappings>
	): (
		context: SelectionContext
	) => SelectionDefinition<PrismaSelect, SelectionMappings>
} {
	const set = (
		selectionsCallback: (context: SelectionContext) => Promise<any>
	): any =>
		// We create a try-catch wrapper around the selections in case it depends on seeding from the non-active website
		async function selectionsCallbackWrapper(context: SelectionContext) {
			try {
				return await selectionsCallback(context)
			} catch {
				// TODO: display the following error when on the other website
				// log.error('Error initializing selections:', error)
				return {}
			}
		} as any

	return { set } as any
}
