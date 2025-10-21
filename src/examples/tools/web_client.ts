interface WebClient {
	get?: (input: any) => Promise<any>;
	post?: (input: any) => Promise<any>;
	put?: (input: any) => Promise<any>;
	delete?: (input: any) => Promise<any>;
}

export { WebClient };



