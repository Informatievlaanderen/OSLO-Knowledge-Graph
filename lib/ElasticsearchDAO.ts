import {ITerm} from "./Term";
import * as elasticsearch from 'elasticsearch';

const config = require('../config.json');

export class ElasticsearchDAO {

    async setupElasticsearch() {
        const client = this.connectToElasticsearch();
        const terminologyIndexExists = await this.checkIfIndexExists(client, 'oslo-terminology');
        const applicationProfileIndexExists = await this.checkIfIndexExists(client, 'oslo-application-profiles');

        if (!terminologyIndexExists) {
            console.log('[ElasticsearchDAO]: oslo-terminology index does not exist on setup. Creating it. ');
            await this.createIndex(client, 'oslo-terminology');
        }

        if (!applicationProfileIndexExists) {
            console.log('[ElasticsearchDAO]: oslo-application-profiles index does not exist on setup. Creating it. ');
            await this.createIndex(client, 'oslo-application-profiles');
        }
    }

    async pushData(data: Array<ITerm>, index: string, type: string) {
        const client = this.connectToElasticsearch();
        const indexExists = await this.checkIfIndexExists(client, index);

        if (!indexExists) {
            console.log('[ElasticsearchDAO]: ' + index + ' does not exist yet. Creating it.');
            this.createIndex(client, index);
        }

        this.pushDataInBulk(client, type, index, data);
    }

    async getId(uri: string, index: string, type: string, client: elasticsearch.Client) {
        const result = await client.search({
            index: index,
            type: type,
            body: {
                query: {
                    match: {
                        URI: uri
                    }
                }
            }
        });

        const object = result.hits.hits.find(obj => obj._source.URI === uri) || null; // Query return multiple results, so we have to filter the object that is an exact match
        return object ? object._id : null;

    }

    async updateVocabulary(data: Array<ITerm>) {
        const client = this.connectToElasticsearch();
        let bulk = [];
        for (let term of data) {
            const id = await this.getId(term.URI, 'oslo-terminology', 'vocabularies', client);
            if (!id) {
                // Term is not yet in ES
                bulk.push({
                    index: {
                        _index: 'oslo-terminology',
                        _type: 'vocabularies'
                    }
                });
                bulk.push(term);
            } else {
                bulk.push({
                    update: {
                        _index: 'oslo-terminology',
                        _type: 'vocabularies',
                        _id: id
                    }
                });
                bulk.push({
                    doc: {
                        prefLabel: term.prefLabel,
                        URI: term.URI,
                        definition: term.definition,
                        context: term.context
                    }
                });
            }
        }

        // Perform bulk indexing of the data passed
        client.bulk({body: bulk}, function (err, response) {
            if (err) {
                console.log("[ElasticsearchDAO]: failed Bulk Update ", err)
            } else {
                console.log("[ElasticsearchDAO]: updated succeeded");
            }
        });
    }

    async updateApplicationProfile(data: Array<ITerm>) {
        const client = this.connectToElasticsearch();
        let bulk = [];
        for (let term of data) {
            const id = await this.getId(term.URI, 'oslo-application-profiles', 'classes', client);
            if (!id) {
                // Term is not yet in ES
                bulk.push({
                    index: {
                        _index: 'oslo-application-profiles',
                        _type: 'classes'
                    }
                });
                bulk.push(term);
            } else {
                bulk.push({
                    update: {
                        _index: 'oslo-application-profiles',
                        _type: 'classes',
                        _id: id
                    }
                });
                bulk.push({
                    doc: {
                        prefLabel: term.prefLabel,
                        URI: term.URI,
                        definition: term.definition,
                        context: term.context
                    }
                });
            }
        }

        // Perform bulk indexing of the data passed
        client.bulk({body: bulk}, function (err, response) {
            if (err) {
                console.log("[ElasticsearchDAO]: failed Bulk Update ", err)
            } else {
                console.log("[ElasticsearchDAO]: updated succeeded");
            }
        });
    }

    private connectToElasticsearch(): elasticsearch.Client {
        const client = new elasticsearch.Client({
            host: config.ELASTIC_ENDPOINT,
            httpAuth: `${config.USERNAME}:${config.PASSWORD}`,
            ssl: {
                rejectUnauthorized: false
            }
        });

        client.ping({
            requestTimeout: 30000
        }, function (error) {
            // At this point, elasticsearch is down, we need to check the service
            if (error) {
                // At this point, eastic search is down, please check your Elasticsearch service
                if (error) {
                    console.error('\x1b[31m%s\x1b[0m ', "Elasticsearch cluster is down");
                    process.exit(1);
                } else {
                    console.log('\x1b[32m%s\x1b[0m ', "Elasticsearch cluster/client is running");
                }
            }
        });

        return client;
    }

    private async checkIfIndexExists(client: elasticsearch.Client, index: string): Promise<boolean> {
        const exists = client.indices.exists({
            index: index
        });
        return exists;
    }

    private createIndex(client: elasticsearch.Client, name: string): void {
        client.indices.create({
            index: name
        }, function (error, response, status) {
            if (error) {
                console.log(error);
            } else {
                console.log("[ElasticsearchDAO]: created a new index: " + name, response);
            }
        });
    }

    private async pushDataInBulk(client, type, index, data) {
        let bulk = [];

        // Loop through each URL and create and push two objects into the array in each loop
        // first object sends the index and type you will be saving the data as
        // second object is the data you want to index
        for (let term of data) {
            const id = await this.getId(term.URI, index, type, client);
            if (!id) {
                bulk.push({
                    index: {
                        _index: index,
                        _type: type
                    }
                });
                bulk.push(term);
            }
        }

        if (bulk.length) {
            // Perform bulk indexing of the data passed
            client.bulk({body: bulk}, function (err, response) {
                if (err) {
                    console.log("[ElasticsearchDAO]: failed bulk operation ", err)
                } else {
                    console.log("[ElasticsearchDAO]: successfully imported ", data.length);
                }
            });
        }


    }
}
