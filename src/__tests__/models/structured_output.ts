import { DTO } from '@/tools/structured_output';
import { array, enumToSchema } from '@/models/structured_output';

@DTO({
	type: 'object',
	name: 'Step',
	description: 'Represents a single step in the reasoning process.',
	properties: {
		explanation: { type: 'string' },
		output: { type: 'string' },
	},
	required: ['explanation', 'output'],
})
class Step {
	explanation: string;
	output: string;

	constructor(explanation: string, output: string) {
		this.explanation = explanation;
		this.output = output;
	}
}

@DTO({
	type: 'object',
	name: 'Metadata',
	description: 'Represents provenance metadata about a reasoning trace.',
	properties: {
		source: { type: 'string' },
		confidence: { type: 'number' },
	},
	required: ['source'],
})
class Metadata {
	source: string;
	confidence?: number;

	constructor(source: string, confidence?: number) {
		this.source = source;
		this.confidence = confidence;
	}
}

@DTO({
	type: 'object',
	name: 'ReasoningSummary',
	description: 'Aggregates reasoning steps with summary metadata and tags.',
	properties: {
		steps: array(Step),
		metadata: Metadata,
		tags: array({ type: 'string' }),
	},
	required: ['steps', 'metadata'],
})
class ReasoningSummary {
	steps: Step[];
	metadata: Metadata;
	tags: string[];

	constructor(steps: Step[], metadata: Metadata, tags: string[]) {
		this.steps = steps;
		this.metadata = metadata;
		this.tags = tags;
	}
}

@DTO({
	type: 'object',
	name: 'MathReasoning',
	description: 'Represents the step-by-step reasoning process for solving a math problem.',
	properties: {
		steps: array(Step),
		final_answer: { type: 'string' },
	},
	required: ['steps', 'final_answer'],
})
class MathReasoning {
	steps: Step[];
	final_answer: string;

	constructor(steps: Step[], final_answer: string) {
		this.steps = steps;
		this.final_answer = final_answer;
	}
}

interface ArithmeticOperation {
	getOrder(): number;
	getStaticNumber(): number;
	getSymbol(): string;
	operate(providedNumber: number): number;
}

@DTO({
	type: 'object',
	name: 'AdditionOperation',
	description: 'Represents an ordered addition operation.',
	properties: {
		order: { 
            type: 'number',
            description: 'The order of this operation in the sequence.',
         },
		staticNumber: { 
            type: 'number',
            description: 'The static number used in this operation.',
        },
	},
	required: ['order', 'staticNumber'],
})
class AdditionOperation implements ArithmeticOperation {
	private order: number;
	private staticNumber: number;

	constructor(order: number, staticNumber: number) {
		this.order = order;
		this.staticNumber = staticNumber;
	}

	getOrder(): number {
		return this.order;
	}

	getSymbol(): string {
		return '+';
	}

	getStaticNumber(): number {
		return this.staticNumber;
	}

	operate(providedNumber: number): number {
		return this.staticNumber + providedNumber;
	}
}

@DTO({
	type: 'object',
	name: 'SubtractionOperation',
	description: 'Represents an ordered subtraction operation.',
	properties: {
		order: { type: 'number' },
		staticNumber: { type: 'number' },
	},
	required: ['order', 'staticNumber'],
})
class SubtractionOperation implements ArithmeticOperation {
	private order: number;
	private staticNumber: number;

	constructor(order: number, staticNumber: number) {
		this.order = order;
		this.staticNumber = staticNumber;
	}

	getOrder(): number {
		return this.order;
	}

	getSymbol(): string {
		return '-';
	}

	getStaticNumber(): number {
		return this.staticNumber;
	}

	operate(providedNumber: number): number {
		return providedNumber - this.staticNumber;
	}
}

@DTO({
	type: 'object',
	name: 'MultiplicationOperation',
	description: 'Represents an ordered multiplication operation.',
	properties: {
		order: { type: 'number' },
		staticNumber: { type: 'number' },
	},
	required: ['order', 'staticNumber'],
})
class MultiplicationOperation implements ArithmeticOperation {
	private order: number;
	private staticNumber: number;

	constructor(order: number, staticNumber: number) {
		this.order = order;
		this.staticNumber = staticNumber;
	}

	getOrder(): number {
		return this.order;
	}

	getSymbol(): string {
		return '*';
	}

	getStaticNumber(): number {
		return this.staticNumber;
	}

	operate(providedNumber: number): number {
		return this.staticNumber * providedNumber;
	}
}

@DTO({
	type: 'object',
	name: 'DivisionOperation',
	description: 'Represents an ordered division operation.',
	properties: {
		order: { type: 'number' },
		staticNumber: { type: 'number' },
	},
	required: ['order', 'staticNumber'],
})
class DivisionOperation implements ArithmeticOperation {
	private order: number;
	private staticNumber: number;

	constructor(order: number, staticNumber: number) {
		this.order = order;
		this.staticNumber = staticNumber;
	}

	getOrder(): number {
		return this.order;
	}

	getSymbol(): string {
		return '/';
	}

	getStaticNumber(): number {
		return this.staticNumber;
	}

	operate(providedNumber: number): number {
		return providedNumber / this.staticNumber;
	}
}

@DTO({
	type: 'object',
	name: 'ArithmeticOperations',
	description: 'Represents a sequence of ordered arithmetic operations.',
	properties: {
		additionOperations: array(AdditionOperation),
		subtractionOperations: array(SubtractionOperation),
		multiplicationOperations: array(MultiplicationOperation),
		divisionOperations: array(DivisionOperation),
	},
	required: [
		'additionOperations',
		'subtractionOperations',
		'multiplicationOperations',
		'divisionOperations',
	],
})
class ArithmeticOperations {
	arithmeticOperations: ArithmeticOperation[];

	constructor(
		additionOperations: AdditionOperation[],
		subtractionOperations: SubtractionOperation[],
		multiplicationOperations: MultiplicationOperation[],
		divisionOperations: DivisionOperation[],
	) {
		this.arithmeticOperations = [
			...additionOperations,
			...subtractionOperations,
			...multiplicationOperations,
			...divisionOperations,
		];

		this.arithmeticOperations.sort((a, b) => a.getOrder() - b.getOrder());
	}

	compute(): number {
		let result = 0;
		for (const operation of this.arithmeticOperations) {
			result = operation.operate(result);
			console.log(
				`Operation ${operation.getOrder()}: ${result} ${operation.getSymbol()} ${operation.getStaticNumber()} = ${operation.operate(result)}`,
			);
		}
		return result;
	}
}

@DTO({
	type: 'object',
	name: 'Address',
	description: 'Street-level address information.',
	properties: {
		line1: { type: 'string' },
		city: { type: 'string' },
		country: { type: 'string' },
		line2: { type: 'string' },
		state: { type: 'string' },
		postalCode: { type: 'string' },
	},
	required: ['line1', 'city', 'country'],
})
class Address {
	line1: string;
	line2?: string;
	city: string;
	state?: string;
	postalCode?: string;
	country: string;

	constructor(
		line1: string,
		city: string,
		country: string,
		line2?: string,
		state?: string,
		postalCode?: string,
	) {
		this.line1 = line1;
		this.city = city;
		this.country = country;
		this.line2 = line2;
		this.state = state;
		this.postalCode = postalCode;
	}
}

@DTO({
	type: 'object',
	name: 'UserProfile',
	description: 'Represents a fully hydrated user profile with nested addresses.',
	properties: {
		id: {
			type: 'string',
			description: 'Unique user identifier.',
		},
		displayName: { type: 'string' },
		age: { type: 'number' },
		isActive: { type: 'boolean' },
		primaryAddress: Address,
		previousAddresses: array(Address),
		emails: array({ type: 'string' }),
	},
	required: ['id', 'displayName', 'age', 'isActive', 'primaryAddress'],
})
class UserProfile {
	id: string;
	displayName: string;
	age: number;
	isActive: boolean;
	primaryAddress: Address;
	previousAddresses: Address[];
	emails: string[];

	constructor(
		id: string,
		displayName: string,
		age: number,
		isActive: boolean,
		primaryAddress: Address,
		previousAddresses: Address[] = [],
		emails: string[] = [],
	) {
		this.id = id;
		this.displayName = displayName;
		this.age = age;
		this.isActive = isActive;
		this.primaryAddress = primaryAddress;
		this.previousAddresses = previousAddresses;
		this.emails = emails;
	}
}

enum TemperatureUnit {
    Celsius = 'C',
    Fahrenheit = 'F',
    Kelvin = 'K',
}

@DTO({
	type: 'object',
	name: 'TelemetryReading',
	description: 'Captures sensor telemetry with coercible primitives.',
	properties: {
		deviceId: { type: 'string' },
        temperatureUnit: enumToSchema({
            type: 'string',
            enum: [TemperatureUnit],
            description: 'The unit of temperature measurement.',
        }),
		temperature: { type: 'number' },
		humidityPercentage: { type: 'number' },
		isOnline: { type: 'boolean' },
		notes: array({ type: 'string' }),
	},
	required: ['deviceId', 'temperatureUnit', 'temperature', 'humidityPercentage', 'isOnline'],
})
class TelemetryReading {
	deviceId: string;
    temperatureUnit: string;
	temperature: number;
	humidityPercentage: number;
	isOnline: boolean;
	notes: string[];

	constructor(
		deviceId: string,
        temperatureUnit: string,
		temperature: number,
		humidityPercentage: number,
		isOnline: boolean,
		notes: string[] = [],
	) {
		this.deviceId = deviceId;
        this.temperatureUnit = temperatureUnit;
		this.temperature = temperature;
		this.humidityPercentage = humidityPercentage;
		this.isOnline = isOnline;
		this.notes = notes;
	}
}

export {
    Step,
    Metadata,
    MathReasoning,
    ReasoningSummary,
    AdditionOperation,
    SubtractionOperation,
    MultiplicationOperation,
    DivisionOperation,
    ArithmeticOperations,
    ArithmeticOperation,
	Address,
	UserProfile,
	TelemetryReading,
};