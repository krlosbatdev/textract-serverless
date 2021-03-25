import { v4 as uuidv4 } from 'uuid';
import * as AWS from 'aws-sdk';
export const db = new AWS.DynamoDB.DocumentClient();
export const s3 = new AWS.S3();
const textract = new AWS.Textract();

// // // //
// DOC: https://github.com/aeksco/aws-pdf-textract-pipeline
// DOC: https://docs.aws.amazon.com/textract/latest/dg/examples-extract-kvp.html
// DOC: https://docs.aws.amazon.com/textract/latest/dg/examples-export-table-csv.html
export async function getFileFromS3({ bucket, key }: { bucket: any; key: any }) {
  const getObject = (params: any) => {
    return new Promise((resolve, reject) => {
      s3.getObject(params, (err, data) => {
        if (err) reject(err);
        else resolve(data.Body);
      });
    });
  };
  const params = {
    Bucket: bucket,
    Key: key,
  };
  const response = (await getObject(params)) as string;
  let data = JSON.parse(response)[0];
  console.log(`Data from S3: ${data}`);
  return data;
}

export async function addKeyValuesToDynamoDB(sanitizedKvPairs: { [key: string]: string }) {
  const item: any = {
    customerId: uuidv4(),
    data: sanitizedKvPairs,
  };
  // Defines the params for db.put

  const dynamoParams = {
    TableName: process.env.tableName!,
    Item: item,
  };
  // Logs DynamoDB params
  console.log('dynamodb Params: ' + dynamoParams);
  // Inserts the record into the DynamoDB table
  await db.put(dynamoParams).promise();
}

export function getSanitizedKeyValues(data: any) {
  const [keyMap, valueMap, blockMap] = getKvMap(data);
  // Get Key Value relationship
  const kvPairs = getKvRelationship({ keyMap, valueMap, blockMap });
  // Logs form key-value pairs from Textract response
  console.log('Got KV pairs');
  // Sanitize KV pairs
  const sanitizedKvPairs: {
    [key: string]: string;
  } = {};
  // Iterate over each key in kvPairs
  Object.keys(kvPairs).forEach((key: string) => {
    // Sanitizes the key from kv pairs
    // DynamoDB key cannot contain any whitespace
    const sanitizedKey: string = key.toLowerCase().trim().replace(/\s/g, '_').replace(':', '');
    // Pulls value from kbPairs, trims whitespace
    const value: string = kvPairs[key].trim();
    // Assigns value from kvPairs to sanitizedKey
    if (value !== '') {
      sanitizedKvPairs[sanitizedKey] = kvPairs[key];
    }
  });
  // Logs sanitized key-value pairs
  console.log(`SanitizedKvPairs : ${JSON.stringify(sanitizedKvPairs, null, 4)}`);

  return sanitizedKvPairs;
}

export async function getTextractResults(jobId: any) {
  try {
    const maxResults = 1000;
    let paginationToken = null;
    let finished = false;
    let pages = [];

    while (finished === false) {
      let response = null;
      if (paginationToken === null)
        response = await textract
          .getDocumentAnalysis({
            JobId: jobId,
            MaxResults: maxResults,
          })
          .promise()
          .catch((err: any) => {
            console.error(err);
          });

      //Put response on pages list
      if (response) {
        pages.push(response);
        console.log('Document Detected.');
      }

      if (response && response['NextToken']) {
        paginationToken = response['NextToken'];
      } else {
        finished = true;
      }
    }
    //convert pages as JSON pattern

    return pages;
  } catch (error) {
    console.log(error);
  }
}

function findValueBlock({ key_block, value_map }: { key_block: any; value_map: any }) {
  let value_block = '';
  if (key_block!! && key_block['Relationships'])
    key_block['Relationships'].forEach((relationship: any) => {
      if (relationship['Type'] == 'VALUE') {
        relationship['Ids'].forEach((value_id: any) => {
          value_block = value_map[value_id];
        });
      }
    });
  return value_block;
}

function getText({ result, blocks_map }: { result: any; blocks_map: any }) {
  let text = '';
  let word;
  if (result!! && result['Relationships']) {
    result['Relationships'].forEach((relationship: any) => {
      if (relationship['Type'] === 'CHILD') {
        relationship['Ids'].forEach((child_id: any) => {
          word = blocks_map[child_id];
          if (word['BlockType'] == 'WORD') {
            text += word['Text'] + ' ';
          }
          if (word['BlockType'] == 'SELECTION_ELEMENT') {
            if (word['SelectionStatus'] == 'SELECTED') {
              text += 'X ';
            }
          }
        });
      }
    });
  }
  return text;
}

function getKvMap(resp: any) {
  // get key and value maps
  let key_map: any = {};
  let value_map: any = {};
  let block_map: any = {};
  resp[0]['Blocks'].forEach((block: any) => {
    const block_id = block['Id'];
    block_map[block_id] = block;
    if (block['BlockType'] == 'KEY_VALUE_SET') {
      if (block['EntityTypes'].includes('KEY')) {
        key_map[block_id] = block;
      } else {
        value_map[block_id] = block;
      }
    }
  });
  return [key_map, value_map, block_map];
}

function getKvRelationship({
  keyMap,
  valueMap,
  blockMap,
}: {
  keyMap: any;
  valueMap: any;
  blockMap: any;
}) {
  let kvs: any = {};
  // for block_id, key_block in key_map.items():
  Object.keys(keyMap).forEach((blockId) => {
    const keyBlock = keyMap[blockId];
    const value_block = findValueBlock({ key_block: keyBlock, value_map: valueMap });
    // console.log("value_block");
    // Gets Key + Value
    const key = getText({ result: keyBlock, blocks_map: blockMap });
    const val = getText({ result: value_block, blocks_map: blockMap });
    kvs[key] = val;
  });
  return kvs;
}
